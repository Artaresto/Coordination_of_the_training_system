trigger TrainingSessionTrigger on Training_Session__c (before insert, before update) {

    TrainingSessionHandler.validateRoomConflicts(
        Trigger.new,
        Trigger.isUpdate ? Trigger.oldMap : null
    );

}
