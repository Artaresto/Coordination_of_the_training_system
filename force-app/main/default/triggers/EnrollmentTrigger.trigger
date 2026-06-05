trigger EnrollmentTrigger on Enrollment__c (before insert, before update, after update) {

    if (Trigger.isBefore && Trigger.isInsert) {
        EnrollmentHandler.beforeInsert(Trigger.new);
    }
    if (Trigger.isBefore && Trigger.isUpdate) {
        EnrollmentHandler.beforeUpdate(Trigger.new, Trigger.oldMap);
    }
    if (Trigger.isAfter && Trigger.isUpdate) {
        EnrollmentHandler.afterUpdate(Trigger.new, Trigger.oldMap);
    }
}