public class EnrollmentHandler {

    public static void beforeInsert(List<Enrollment__c> newList) {

        Set<Id> trainingIds = new Set<Id>();
        Set<Id> participantIds = new Set<Id>();
        for (Enrollment__c e : newList) {
            trainingIds.add(e.Training__c);
            participantIds.add(e.Participant__c);
        }

        Map<Id, Training__c> trainings = new Map<Id, Training__c>([
            SELECT Id, Status__c, Max_Participants__c, Enrolled_Count__c,
                Start_Date__c, End_Date__c
            FROM Training__c WHERE Id IN :trainingIds
        ]);

        Set<String> existingKeys = new Set<String>();
        Set<String> cancelledKeys = new Set<String>();
        for (Enrollment__c e : [
            SELECT Participant__c, Training__c, Status__c FROM Enrollment__c
            WHERE Training__c IN :trainingIds
        ]) {
            String key = e.Participant__c + '_' + e.Training__c;
            if (e.Status__c == 'Cancelled') {
                cancelledKeys.add(key);
            } else {
                existingKeys.add(key);
            }
        }

        Map<Id, List<Enrollment__c>> activeByParticipant = new Map<Id, List<Enrollment__c>>();
        for (Enrollment__c e : [
            SELECT Participant__c, Training__r.Name,
                   Training__r.Start_Date__c, Training__r.End_Date__c
            FROM Enrollment__c
            WHERE Participant__c IN :participantIds AND Status__c = 'Enrolled'
        ]) {
            if (!activeByParticipant.containsKey(e.Participant__c)) {
                activeByParticipant.put(e.Participant__c, new List<Enrollment__c>());
            }
            activeByParticipant.get(e.Participant__c).add(e);
        }

        for (Enrollment__c e : newList) {
            Training__c t = trainings.get(e.Training__c);

            if (t.Status__c != 'Active') {
                e.addError('Enrollment is only possible for trainings with Active status.');
                continue;
            }

            String key = e.Participant__c + '_' + e.Training__c;
            if (existingKeys.contains(key)) {
                e.addError('Participant is already enrolled in this training.');
                continue;
            }
            if (cancelledKeys.contains(key)) {
                e.addError('You cancelled your enrollment in this training and cannot enroll again.');
                continue;
            }

            Enrollment__c conflicting = null;
            if (activeByParticipant.containsKey(e.Participant__c)) {
                for (Enrollment__c other : activeByParticipant.get(e.Participant__c)) {
                    if (t.Start_Date__c < other.Training__r.End_Date__c
                        && other.Training__r.Start_Date__c < t.End_Date__c) {
                        conflicting = other;
                        break;
                    }
                }
            }
            if (conflicting != null) {
                e.addError('You already have training scheduled for this date: '
                           + conflicting.Training__r.Name);
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
                Date startDate = trainings.get(e.Training__c).Start_Date__c.date();

                // nie można wypisać się ze szkolenia, które już się rozpoczęło (dotyczy wszystkich)
                if (startDate < Date.today()) {
                    e.addError('You cannot unenroll from a training that has already started.');
                    continue;
                }

                if (!isCoordOrAdmin) {
                    Integer dniDo = Date.today().daysBetween(startDate);
                    if (dniDo < 3) {
                        e.addError('Self-cancellation is only possible up to 3 days before the training. Please contact your coordinator.');
                    }
                }
            }
        }
    }

    public static void afterUpdate(List<Enrollment__c> newList, Map<Id, Enrollment__c> oldMap) {

        Set<Id> cancelledTrainings = new Set<Id>();

        for (Enrollment__c e : newList) {
            Enrollment__c old = oldMap.get(e.Id);
            if (e.Status__c == 'Cancelled' && old.Status__c != 'Cancelled') {
                cancelledTrainings.add(e.Training__c);
            }
        }

        if (!cancelledTrainings.isEmpty()) promoteFromWaitlist(cancelledTrainings);
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
}