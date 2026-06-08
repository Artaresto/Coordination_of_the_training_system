trigger TrainingTrigger on Training__c (before insert, before update) {

    TrainingHandler.validateRoomConflicts(
        Trigger.new,
        Trigger.oldMap
    );

}