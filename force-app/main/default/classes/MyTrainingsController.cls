public without sharing class MyTrainingsController {

    @AuraEnabled
    public static List<Enrollment__c> getMyEnrollments() {
        Id contactId = [SELECT ContactId FROM User WHERE Id = :UserInfo.getUserId()].ContactId;
        if (contactId == null) {
            return new List<Enrollment__c>();
        }
        return [
            SELECT Id, Status__c, Enrollment_Date__c,
                Training_Rating__c, Trainer_Rating__c, Review_Comment__c,
                Training__c, Training__r.Name, Training__r.Description__c,
                Training__r.Start_Date__c, Training__r.End_Date__c,
                Training__r.Format__c, Training__r.Location__c,
                Training__r.Trainer__r.Name, Training__r.Trainer__r.Specialization__c,
                Training__r.Trainer__r.Bio__c
            FROM Enrollment__c
            WHERE Participant__c = :contactId AND Status__c != 'Cancelled'
            ORDER BY Training__r.Start_Date__c ASC
        ];
    }

    @AuraEnabled
    public static void cancelEnrollment(Id enrollmentId) {
        Id contactId = [SELECT ContactId FROM User WHERE Id = :UserInfo.getUserId()].ContactId;

        Enrollment__c e = [
            SELECT Id, Participant__c FROM Enrollment__c WHERE Id = :enrollmentId
        ];
        if (contactId == null || e.Participant__c != contactId) {
            throw new AuraHandledException('You can only cancel your own enrollments.');
        }

        e.Status__c = 'Cancelled';
        try {
            update e; // trigger enforces the 3-day rule and waitlist promotion
        } catch (DmlException ex) {
            throw new AuraHandledException(ex.getDmlMessage(0));
        }
    }

    @AuraEnabled
    public static void submitReview(Id enrollmentId, Integer trainingRating,
                                    Integer trainerRating, String comment) {
        Id contactId = [SELECT ContactId FROM User WHERE Id = :UserInfo.getUserId()].ContactId;

        Enrollment__c e = [
            SELECT Id, Participant__c, Status__c FROM Enrollment__c WHERE Id = :enrollmentId
        ];
        if (contactId == null || e.Participant__c != contactId) {
            throw new AuraHandledException('You can only review your own enrollments.');
        }
        if (e.Status__c != 'Completed') {
            throw new AuraHandledException('You can only review trainings you have completed.');
        }

        e.Training_Rating__c = trainingRating;
        e.Trainer_Rating__c  = trainerRating;
        e.Review_Comment__c  = comment;
        e.Reviewed_Date__c   = Date.today();

        try {
            update e;
        } catch (DmlException ex) {
            throw new AuraHandledException(ex.getDmlMessage(0));
        }
    }
}