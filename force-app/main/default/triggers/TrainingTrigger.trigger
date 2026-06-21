trigger TrainingTrigger on Training__c (before insert, before update) {

    if (Trigger.isInsert) {
        TrainingHandler.validateNotInPast(Trigger.new);
    }

    // Status (Planed/Active/Ended) jest zawsze wyliczany na podstawie dat - niezależnie od tego,
    // co przyszło z formularza/UI. Działa zarówno przy tworzeniu, jak i edycji.
    TrainingHandler.enforceComputedStatus(Trigger.new);

}
