public class EnrollmentHandler {

    public static void beforeInsert(List<Enrollment__c> newList) {

        Set<Id> trainingIds = new Set<Id>();
        for (Enrollment__c e : newList) trainingIds.add(e.Training__c);

        Map<Id, Training__c> trainings = new Map<Id, Training__c>([
            SELECT Id, Status__c, Max_Participants__c, Enrolled_Count__c
            FROM Training__c WHERE Id IN :trainingIds
        ]);

        Set<String> existingKeys = new Set<String>();
        for (Enrollment__c e : [
            SELECT Participant__c, Training__c FROM Enrollment__c
            WHERE Training__c IN :trainingIds AND Status__c != 'Cancelled'
        ]) {
            existingKeys.add(e.Participant__c + '_' + e.Training__c);
        }

        for (Enrollment__c e : newList) {
            Training__c t = trainings.get(e.Training__c);

            if (t.Status__c != 'Active') {
                e.addError('Enrollment is only possible for trainings with Active status.');
                continue;
            }
            if (existingKeys.contains(e.Participant__c + '_' + e.Training__c)) {
                e.addError('Participant is already enrolled in this training.');
                continue;
            }

            Integer wolneMiejsca = (Integer) t.Max_Participants__c - (Integer) t.Enrolled_Count__c;
            e.Status__c = wolneMiejsca > 0 ? 'Enrolled' : 'Waitlisted';
            e.Enrollment_Date__c = Date.today();
        }
    }

    public static void beforeUpdate(List<Enrollment__c> newList, Map<Id, Enrollment__c> oldMap) {

        Set<Id> trainingIds = new Set<Id>();
        for (Enrollment__c e : newList) {
            if (e.Status__c == 'Cancelled' && oldMap.get(e.Id).Status__c != 'Cancelled') {
                trainingIds.add(e.Training__c);
            }
        }
        if (trainingIds.isEmpty()) return;

        Map<Id, Training__c> trainings = new Map<Id, Training__c>([
            SELECT Id, Start_Date__c FROM Training__c WHERE Id IN :trainingIds
        ]);

        String profileName = [SELECT Profile.Name FROM User WHERE Id = :UserInfo.getUserId()].Profile.Name;
        Boolean isCoordOrAdmin = (profileName == 'Training Coordinator Profile' || profileName == 'System Administrator');

        for (Enrollment__c e : newList) {
            if (e.Status__c == 'Cancelled' && oldMap.get(e.Id).Status__c != 'Cancelled') {
                if (!isCoordOrAdmin) {
                    Integer dniDo = Date.today().daysBetween(trainings.get(e.Training__c).Start_Date__c.date());
                    if (dniDo < 3) {
                        e.addError('Self-cancellation is only possible up to 3 days before the training. Please contact your coordinator.');
                    }
                }
            }
        }
    }

    public static void afterUpdate(List<Enrollment__c> newList, Map<Id, Enrollment__c> oldMap) {

        Set<Id> cancelledTrainings = new Set<Id>();
        List<Enrollment__c> completed = new List<Enrollment__c>();

        for (Enrollment__c e : newList) {
            Enrollment__c old = oldMap.get(e.Id);
            if (e.Status__c == 'Cancelled'  && old.Status__c != 'Cancelled')  cancelledTrainings.add(e.Training__c);
            if (e.Status__c == 'Completed'  && old.Status__c != 'Completed')  completed.add(e);
        }

        if (!cancelledTrainings.isEmpty()) promoteFromWaitlist(cancelledTrainings);
        if (!completed.isEmpty())          generateCertificates(completed);
    }

    private static void promoteFromWaitlist(Set<Id> trainingIds) {

        Map<Id, Training__c> trainings = new Map<Id, Training__c>([
            SELECT Id, Max_Participants__c, Enrolled_Count__c FROM Training__c WHERE Id IN :trainingIds
        ]);

        Map<Id, Enrollment__c> firstInQueue = new Map<Id, Enrollment__c>();
        for (Enrollment__c e : [
            SELECT Id, Training__c FROM Enrollment__c
            WHERE Training__c IN :trainingIds AND Status__c = 'Waitlisted'
            ORDER BY Enrollment_Date__c ASC
        ]) {
            if (!firstInQueue.containsKey(e.Training__c)) {
                firstInQueue.put(e.Training__c, e);
            }
        }

        List<Enrollment__c> toPromote = new List<Enrollment__c>();
        for (Id tId : firstInQueue.keySet()) {
            Training__c t = trainings.get(tId);
            if (t.Enrolled_Count__c < t.Max_Participants__c) {
                Enrollment__c e = firstInQueue.get(tId);
                e.Status__c = 'Enrolled';
                toPromote.add(e);
            }
        }

        if (!toPromote.isEmpty()) update toPromote;
    }

    private static void generateCertificates(List<Enrollment__c> completed) {

        Set<Id> enrollmentIds = new Set<Id>();
        for (Enrollment__c e : completed) enrollmentIds.add(e.Id);

        Set<Id> alreadyHasCert = new Set<Id>();
        for (Certificate__c c : [SELECT Enrollment__c FROM Certificate__c WHERE Enrollment__c IN :enrollmentIds]) {
            alreadyHasCert.add(c.Enrollment__c);
        }

        List<Certificate__c> toCreate = new List<Certificate__c>();
        for (Enrollment__c e : completed) {
            if (!alreadyHasCert.contains(e.Id)) {
                toCreate.add(new Certificate__c(
                    Enrollment__c  = e.Id,
                    Issue_Date__c  = Date.today(),
                    Valid_Until__c = Date.today().addYears(2)
                ));
            }
        }

        if (!toCreate.isEmpty()) insert toCreate;
    }
}