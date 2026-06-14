public without sharing class TrainingCatalogController {

    public class CatalogResult {
        @AuraEnabled public List<Training__c> trainings;
        @AuraEnabled public Map<Id, String> enrollmentStatusByTraining;
        @AuraEnabled public Map<Id, Id> enrollmentIdByTraining;
    }

    @AuraEnabled
    public static CatalogResult getTrainings(String searchTerm, String format) {

        String query = 'SELECT Id, Name, Description__c, Start_Date__c, End_Date__c, ' +
                       'Format__c, Location__c, Price__c, ' +
                       'Max_Participants__c, Enrolled_Count__c, Free_Spots__c, ' +
                       'Trainer__r.Name, Trainer__r.Specialization__c, Trainer__r.Bio__c ' +
                       'FROM Training__c WHERE Status__c = \'Active\'';

        if (String.isNotBlank(searchTerm)) {
            query += ' AND Name LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\'';
        }
        if (String.isNotBlank(format)) {
            query += ' AND Format__c = \'' + String.escapeSingleQuotes(format) + '\'';
        }
        query += ' ORDER BY Start_Date__c ASC';

        CatalogResult result = new CatalogResult();
        result.trainings = Database.query(query);

        Map<Id, String> statusByTraining = new Map<Id, String>();
        Map<Id, Id> idByTraining = new Map<Id, Id>();

        Id contactId = [SELECT ContactId FROM User WHERE Id = :UserInfo.getUserId()].ContactId;
        if (contactId != null) {
            for (Enrollment__c e : [
                SELECT Id, Training__c, Status__c FROM Enrollment__c
                WHERE Participant__c = :contactId
            ]) {
                if (e.Status__c != 'Cancelled' || !statusByTraining.containsKey(e.Training__c)) {
                    statusByTraining.put(e.Training__c, e.Status__c);
                    idByTraining.put(e.Training__c, e.Id);
                }
            }
        }

        result.enrollmentStatusByTraining = statusByTraining;
        result.enrollmentIdByTraining = idByTraining;
        return result;
    }
}