public without sharing class EnrollmentController {

    @AuraEnabled
    public static String enrollParticipant(Id trainingId, String fileName, String base64Data) {

        User currentUser = [
            SELECT ContactId FROM User WHERE Id = :UserInfo.getUserId()
        ];
        if (currentUser.ContactId == null) {
            throw new AuraHandledException('No participant profile found for this user.');
        }

        Training__c training = [
            SELECT Id, Prerequisite_Info__c
            FROM Training__c WHERE Id = :trainingId
        ];
        Boolean requiresPrerequisite = String.isNotBlank(training.Prerequisite_Info__c);

        if (requiresPrerequisite && String.isBlank(base64Data)) {
            throw new AuraHandledException('This training requires a certificate. Please attach a file.');
        }

        Enrollment__c enrollment = new Enrollment__c(
            Training__c    = trainingId,
            Participant__c = currentUser.ContactId
        );
        try {
            insert enrollment; // trigger ustawia Enrolled / Waitlisted
        } catch (DmlException e) {
            throw new AuraHandledException(e.getDmlMessage(0));
        }

        if (requiresPrerequisite) {
            try {
                ContentVersion cv = new ContentVersion(
                    Title        = fileName,
                    PathOnClient = fileName,
                    VersionData  = EncodingUtil.base64Decode(base64Data)
                );
                insert cv;

                Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
                insert new ContentDocumentLink(
                    ContentDocumentId = docId,
                    LinkedEntityId    = enrollment.Id,
                    ShareType         = 'V',
                    Visibility        = 'AllUsers'
                );

                enrollment.Status__c = 'Pending Approval';
                update enrollment;
            } catch (Exception ex) {
                throw new AuraHandledException('Could not attach file: ' + ex.getMessage());
            }
            return 'Pending Approval';
        }

        return [SELECT Status__c FROM Enrollment__c WHERE Id = :enrollment.Id].Status__c;
    }
}