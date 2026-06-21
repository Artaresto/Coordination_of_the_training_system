public class TrainingHandler {

    // Nie pozwalamy zakładać NOWYCH szkoleń, których termin rozpoczęcia jest już w przeszłości.
    // Dotyczy tylko tworzenia (insert) - nie blokujemy edycji już istniejących/zakończonych rekordów.
    public static void validateNotInPast(List<Training__c> newList) {
        Datetime now = Datetime.now();
        for (Training__c t : newList) {
            if (t.Start_Date__c != null && t.Start_Date__c < now) {
                t.addError('Nie można utworzyć szkolenia, którego data rozpoczęcia jest w przeszłości.');
            }
        }
    }

    // Wymusza poprawny Status__c (Planed/Active/Ended) na podstawie RZECZYWISTYCH dat,
    // niezależnie od tego, co zostało wybrane w formularzu.
    public static void enforceComputedStatus(List<Training__c> newList) {
        Datetime now = Datetime.now();
        for (Training__c t : newList) {
            String computed = TrainingStatusUpdater.computeStatus(t.Start_Date__c, t.End_Date__c, now);
            if (computed != null) {
                t.Status__c = computed;
            }
        }
    }

    // UWAGA: Konflikt sali NIE jest już sprawdzany tutaj. Training__c.Start_Date__c/End_Date__c
    // reprezentują teraz zakres CAŁEGO kursu (np. 4 tygodnie cotygodniowych spotkań), a nie
    // pojedynczy termin - sprawdzanie konfliktu po tych datach dawałoby fałszywe alarmy.
    // Faktyczny konflikt sali sprawdza TrainingSessionHandler, bo to pojedyncze sesje
    // (Training_Session__c) mają realne godziny zajęcia pomieszczenia.
}
