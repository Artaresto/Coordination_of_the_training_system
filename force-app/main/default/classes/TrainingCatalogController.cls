public without sharing class TrainingCatalogController {

    @AuraEnabled(cacheable=true)
    public static List<Training__c> getTrainings(String searchTerm, String format) {

        String query = 'SELECT Id, Name, Start_Date__c, Format__c, Location__c, Price__c, ' +
                       'Max_Participants__c, Enrolled_Count__c, Free_Spots__c ' +
                       'FROM Training__c WHERE Status__c = \'Active\'';

        if (String.isNotBlank(searchTerm)) {
            query += ' AND Name LIKE \'%' + String.escapeSingleQuotes(searchTerm) + '%\'';
        }
        if (String.isNotBlank(format)) {
            query += ' AND Format__c = \'' + String.escapeSingleQuotes(format) + '\'';
        }

        query += ' ORDER BY Start_Date__c ASC';

        return Database.query(query);
    }
}