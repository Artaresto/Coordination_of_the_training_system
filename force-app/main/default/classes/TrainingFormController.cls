public without sharing class TrainingFormController {

    @AuraEnabled(cacheable=true)
    public static List<Room__c> getRoomsByLocation(String location) {
        if (String.isBlank(location)) {
            return new List<Room__c>();
        }
        return [
            SELECT Id, Name, Max_Capacity__c, Has_computers__c, Location__c
            FROM Room__c
            WHERE Location__c = :location
            ORDER BY Name ASC
        ];
    }

    @AuraEnabled(cacheable=true)
    public static List<String> getDistinctLocations() {
        List<String> locations = new List<String>();
        for (AggregateResult ar : [
            SELECT Location__c loc
            FROM Room__c
            WHERE Location__c != null
            GROUP BY Location__c
            ORDER BY Location__c ASC
        ]) {
            locations.add((String) ar.get('loc'));
        }
        return locations;
    }
}