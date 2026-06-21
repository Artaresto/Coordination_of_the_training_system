public class TrainingSessionHandler {

    public static void validateRoomConflicts(
        List<Training_Session__c> newList,
        Map<Id, Training_Session__c> oldMap
    ) {
        List<Training_Session__c> toCheck = new List<Training_Session__c>();
        Set<Id> trainingIds = new Set<Id>();

        for (Training_Session__c s : newList) {
            if (s.Start_Time__c == null || s.Duration_Minutes__c == null || s.Training__c == null) continue;

            if (oldMap != null) {
                Training_Session__c old = oldMap.get(s.Id);
                Boolean relevantChange =
                    s.Start_Time__c != old.Start_Time__c ||
                    s.Duration_Minutes__c != old.Duration_Minutes__c ||
                    s.Training__c != old.Training__c;
                if (!relevantChange) continue;
            }

            toCheck.add(s);
            trainingIds.add(s.Training__c);
        }

        if (toCheck.isEmpty()) return;

        // Sala i status kursu pochodzą z rekordu nadrzędnego Training__c
        Map<Id, Training__c> trainingsById = new Map<Id, Training__c>([
            SELECT Id, Room__c, Status__c, Name
            FROM Training__c
            WHERE Id IN :trainingIds
        ]);

        Set<Id> roomIds = new Set<Id>();
        for (Training__c t : trainingsById.values()) {
            if (t.Room__c != null) roomIds.add(t.Room__c);
        }
        if (roomIds.isEmpty()) return;

        // Wszystkie terminy (innych szkoleń) w tych samych salach, dla kursów które nie są Ended
        List<Training_Session__c> existingSessions = [
            SELECT Id, Start_Time__c, Duration_Minutes__c, Training__c, Training__r.Room__c, Training__r.Name, Training__r.Status__c
            FROM Training_Session__c
            WHERE Training__r.Room__c IN :roomIds
            AND Training__r.Status__c != 'Ended'
        ];

        for (Training_Session__c newSession : toCheck) {
            Training__c parent = trainingsById.get(newSession.Training__c);
            if (parent == null || parent.Room__c == null) continue;

            Datetime newStart = newSession.Start_Time__c;
            Datetime newEnd = newSession.Start_Time__c.addMinutes(Integer.valueOf(newSession.Duration_Minutes__c));

            for (Training_Session__c existing : existingSessions) {
                if (existing.Id == newSession.Id) continue;
                if (existing.Training__r.Room__c != parent.Room__c) continue;
                if (existing.Start_Time__c == null || existing.Duration_Minutes__c == null) continue;

                Datetime existingStart = existing.Start_Time__c;
                Datetime existingEnd = existing.Start_Time__c.addMinutes(Integer.valueOf(existing.Duration_Minutes__c));

                Boolean overlap = newStart < existingEnd && existingStart < newEnd;

                if (overlap) {
                    newSession.addError(
                        'Wybrana sala jest już zajęta w tym terminie przez szkolenie: ' + existing.Training__r.Name
                    );
                    break;
                }
            }
        }
    }
}
