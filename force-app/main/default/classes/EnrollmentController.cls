public without sharing class EnrollmentController {

    @AuraEnabled
    public static String enrollParticipant(Id trainingId) {

        // Pobieramy ContactId zalogowanego użytkownika (Experience Cloud)
        User currentUser = [
            SELECT ContactId FROM User WHERE Id = :UserInfo.getUserId()
        ];

        if (currentUser.ContactId == null) {
            throw new AuraHandledException('No participant profile found for this user.');
        }

        Id participantId = currentUser.ContactId;

        // Tworzymy zapis — trigger ustawi status Enrolled lub Waitlisted
        Enrollment__c enrollment = new Enrollment__c(
            Training__c    = trainingId,
            Participant__c = participantId
        );

        try {
            insert enrollment;
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        }

        // Zwracamy status ustawiony przez trigger
        return [SELECT Status__c FROM Enrollment__c WHERE Id = :enrollment.Id].Status__c;
    }
}