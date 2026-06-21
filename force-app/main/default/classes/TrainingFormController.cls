public without sharing class TrainingFormController {

    @AuraEnabled(cacheable=true)
    public static List<Room__c> getRoomsByLocation(String location, Boolean requiresComputers) {
        if (String.isBlank(location)) {
            return new List<Room__c>();
        }
        if (requiresComputers == true) {
            return [
                SELECT Id, Name, Max_Capacity__c, Has_computers__c, Location__c
                FROM Room__c
                WHERE Location__c = :location AND Has_computers__c = true
                ORDER BY Name ASC
            ];
        }
        return [
            SELECT Id, Name, Max_Capacity__c, Has_computers__c, Location__c
            FROM Room__c
            WHERE Location__c = :location
            ORDER BY Name ASC
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getDistinctLocations() {
        List<String> locations = new List<String>();
        for (AggregateResult ar : [
            SELECT Location__c loc
            FROM Room__c
            WHERE Location__c != null
            GROUP BY Location__c
            ORDER BY Location__c ASC
        ]) {
            locations.add((String) ar.get('loc'));
        }
        return locations;
    }

    // Tworzy JEDNO szkolenie (Training__c) wraz z kompletem terminów (Training_Session__c).
    // Dzięki temu cykliczne szkolenie to nadal jeden rekord Training__c - jeden komplet zapisów
    // (Enrollment__c) i jeden certyfikat na koniec, a nie N osobnych "szkoleń".
    @AuraEnabled
    public static Id createTrainingWithSessions(Training__c training, List<Training_Session__c> sessions) {
        if (training == null) {
            throw new AuraHandledException('Brak danych szkolenia.');
        }
        try {
            insert as user training;

            if (sessions != null && !sessions.isEmpty()) {
                for (Training_Session__c s : sessions) {
                    s.Training__c = training.Id;
                }
                insert as user sessions;
            }
        } catch (DmlException dmlEx) {
            // Przekazujemy prawdziwy komunikat z Salesforce (np. konflikt sali, błąd walidacji)
            // zamiast generycznego, ucinanego przez platformę błędu.
            throw new AuraHandledException(dmlEx.getDmlMessage(0));
        } catch (AuraHandledException ahEx) {
            throw ahEx;
        } catch (Exception ex) {
            throw new AuraHandledException(ex.getMessage());
        }

        return training.Id;
    }

    @AuraEnabled
    public static void deleteTraining(Id trainingId) {
        if (trainingId == null) {
            throw new AuraHandledException('Brak identyfikatora szkolenia do usunięcia.');
        }
        try {
            List<Training__c> toDelete = [SELECT Id FROM Training__c WHERE Id = :trainingId WITH SECURITY_ENFORCED LIMIT 1];
            if (toDelete.isEmpty()) {
                throw new AuraHandledException('Nie znaleziono szkolenia o podanym identyfikatorze (mogło już zostać usunięte).');
            }
            delete as user toDelete;
        } catch (DmlException dmlEx) {
            // Przekazujemy prawdziwy komunikat z Salesforce zamiast generycznego błędu LDS.
            throw new AuraHandledException(dmlEx.getDmlMessage(0));
        } catch (AuraHandledException ahEx) {
            throw ahEx;
        } catch (Exception ex) {
            throw new AuraHandledException(ex.getMessage());
        }
    }
}