public class TrainingStatusUpdater {

    // Przelicza status TYLKO szkoleń należących do danego koordynatora (OwnerId).
    // Wywoływane przy każdym wejściu do panelu koordynatora, żeby zakładki
    // Aktywne/Planowane/Zakończone od razu pokazywały aktualny stan.
    public static void updateStatusesForOwner(Id ownerId) {
        List<Training__c> trainings = [
            SELECT Id, Status__c, Start_Date__c, End_Date__c
            FROM Training__c
            WHERE OwnerId = :ownerId
        ];
        recalculateAndSave(trainings);
    }

    // Przelicza status WSZYSTKICH szkoleń w organizacji. Używane przez Scheduled Apex,
    // żeby status był aktualny nawet jeśli żaden koordynator nie otworzył akurat dashboardu
    // (np. dla logiki zapisów uczestników, która sprawdza Status__c = 'Active').
    public static void updateAllStatuses() {
        List<Training__c> trainings = [
            SELECT Id, Status__c, Start_Date__c, End_Date__c
            FROM Training__c
        ];
        recalculateAndSave(trainings);
    }

    private static void recalculateAndSave(List<Training__c> trainings) {
        Datetime now = Datetime.now();
        List<Training__c> toUpdate = new List<Training__c>();

        for (Training__c t : trainings) {
            String computedStatus = computeStatus(t.Start_Date__c, t.End_Date__c, now);
            if (computedStatus != null && computedStatus != t.Status__c) {
                toUpdate.add(new Training__c(Id = t.Id, Status__c = computedStatus));
            }
        }

        if (!toUpdate.isEmpty()) {
            try {
                update toUpdate;
            } catch (DmlException dmlEx) {
                // Nie chcemy, żeby błąd przeliczenia statusu w tle (np. konflikt zgłoszony
                // przez inny trigger) wywalał cały odczyt danych do dashboardu koordynatora.
                // Logujemy do debug logów i kontynuujemy - dashboard pokaże wtedy "stary" status,
                // zamiast nie pokazać nic.
                System.debug(LoggingLevel.ERROR, 'TrainingStatusUpdater: nie udało się przeliczyć statusu części szkoleń: ' + dmlEx.getMessage());
            }
        }
    }

    // Reguła:
    // - brak Start_Date__c -> bez zmian (null = nie wiadomo, nie ingerujemy)
    // - End_Date__c minęła -> Ended
    // - Start_Date__c już nadeszła, a End_Date__c jeszcze nie -> Active
    // - Start_Date__c jeszcze nie nadeszła -> Planed
    public static String computeStatus(Datetime startDate, Datetime endDate, Datetime now) {
        if (startDate == null) {
            return null;
        }
        if (endDate != null && endDate <= now) {
            return 'Ended';
        }
        if (startDate <= now) {
            return 'Active';
        }
        return 'Planed';
    }
}
