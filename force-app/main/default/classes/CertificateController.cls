public without sharing class CertificateController {
    @AuraEnabled
    public static List<Certificate__c> getMyCertificates() {
        Id contactId = [SELECT ContactId FROM User WHERE Id = :UserInfo.getUserId()].ContactId;
        if (contactId == null) return new List<Certificate__c>();
        return [
            SELECT Id, Certificate_Number__c, Issue_Date__c, Valid_Until__c,
                   Enrollment__r.Participant__r.Name,
                   Enrollment__r.Training__r.Name,
                   Enrollment__r.Training__r.Trainer__r.Name
            FROM Certificate__c
            WHERE Enrollment__r.Participant__c = :contactId
            ORDER BY Issue_Date__c DESC
        ];
    }
}