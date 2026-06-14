trigger PreventDoubleBooking on Training__c (before insert, before update) {

    List<Training__c> toCheck = new List<Training__c>();
    Set<Id> ownerIds = new Set<Id>();

    for (Training__c t : Trigger.new) {
        if (t.Start_Date__c == null || t.End_Date__c == null) continue;

        // przy edycji sprawdzaj tylko, gdy zmienił się termin
        // (przeliczenie roll-upu Enrolled_Count__c nie zmienia dat -> pomijamy)
        if (Trigger.isUpdate) {
            Training__c old = Trigger.oldMap.get(t.Id);
            if (t.Start_Date__c == old.Start_Date__c &&
                t.End_Date__c == old.End_Date__c) {
                continue;
            }
        }
        toCheck.add(t);
        ownerIds.add(t.OwnerId);
    }

    if (toCheck.isEmpty()) return;

    List<Training__c> existingTrainings = [
        SELECT Id, Name, OwnerId, Start_Date__c, End_Date__c
        FROM Training__c
        WHERE OwnerId IN :ownerIds
        AND Status__c != 'Cancelled'
    ];

    for (Training__c newTraining : toCheck) {
        for (Training__c existing : existingTrainings) {
            if (Trigger.isUpdate && newTraining.Id == existing.Id) continue;

            if (newTraining.OwnerId == existing.OwnerId &&
                newTraining.Start_Date__c <= existing.End_Date__c &&
                newTraining.End_Date__c >= existing.Start_Date__c) {

                newTraining.addError('Nie możesz utworzyć szkolenia w tym terminie. Masz już zaplanowane szkolenie: ' + existing.Name);
                break;
            }
        }
    }
}