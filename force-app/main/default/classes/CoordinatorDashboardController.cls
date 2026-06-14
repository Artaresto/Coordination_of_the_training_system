public with sharing class CoordinatorDashboardController {
    
    @AuraEnabled(cacheable=true)
    public static List<Training__c> getMyTrainings() {
        return [SELECT Id, Name, Format__c, Max_Participants__c, Enrolled_Count__c, Start_Date__c, End_Date__c, Status__c 
                FROM Training__c 
                WHERE OwnerId = :UserInfo.getUserId() 
                WITH SECURITY_ENFORCED 
                ORDER BY Start_Date__c ASC];
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Enrollment__c> getPendingEnrollments() {
        return [SELECT Id, Name, Participant__r.Name, Training__r.Name, Enrollment_Date__c, Status__c 
                FROM Enrollment__c 
                WHERE Training__r.OwnerId = :UserInfo.getUserId() 
                // ZMIANA: Szukamy tylko osób na liście rezerwowej (ang. Waitlisted)
                AND Status__c = 'Waitlisted'
                WITH SECURITY_ENFORCED 
                ORDER BY Enrollment_Date__c ASC];
    }
    
    @AuraEnabled(cacheable=true)
    public static List<Training__c> getTrainingsEndingSoon() {
        return [SELECT Id, Name, End_Date__c, Format__c 
                FROM Training__c 
                WHERE OwnerId = :UserInfo.getUserId() AND Status__c = 'Active' 
                AND End_Date__c = NEXT_N_DAYS:7 
                WITH SECURITY_ENFORCED ORDER BY End_Date__c ASC];
    }
    
    @AuraEnabled
    public static void updateEnrollmentStatus(Id enrollmentId, String newStatus) {
        Enrollment__c enrollment = [SELECT Id, Status__c FROM Enrollment__c WHERE Id = :enrollmentId WITH SECURITY_ENFORCED LIMIT 1];
        enrollment.Status__c = newStatus;
        update as user enrollment;
    }

    @AuraEnabled
    public static List<Enrollment__c> getTrainingParticipants(Id trainingId) {
        return [SELECT Id, Name, Participant__r.Name, Status__c, Enrollment_Date__c 
                FROM Enrollment__c 
                // ZMIANA: Szukamy osób ze statusem Enrolled lub Completed
                WHERE Training__c = :trainingId AND Status__c IN ('Enrolled', 'Completed')
                WITH SECURITY_ENFORCED];
    }

    @AuraEnabled
    public static void generateCertificates(List<Id> enrollmentIds) {
        List<Enrollment__c> enrollmentsToUpdate = new List<Enrollment__c>();
        List<Certificate__c> certificatesToInsert = new List<Certificate__c>();
    // 1. Pobierz ID szkoleń, dla których generujemy certyfikaty
        List<Enrollment__c> enrollments = [SELECT Id, Training__r.Status__c FROM Enrollment__c WHERE Id IN :enrollmentIds];
        
        for (Enrollment__c enr : enrollments) {
            // Zmień 'Completed' na status, który oznacza u Ciebie zakończone szkolenie
            if (enr.Training__r.Status__c != 'Completed') {
                throw new AuraHandledException('Nie można wystawić certyfikatu dla szkolenia, które nie jest jeszcze ukończone.');
            }
        }

        for (Id enrId : enrollmentIds) {
            // ZMIANA: Po wygenerowaniu certyfikatu zmieniamy status na 'Completed'
            enrollmentsToUpdate.add(new Enrollment__c(Id = enrId, Status__c = 'Completed'));
            
            Certificate__c cert = new Certificate__c();
            cert.Enrollment__c = enrId;
            cert.Issue_Date__c = Date.today();
            certificatesToInsert.add(cert);
        }

        if (!enrollmentsToUpdate.isEmpty()) {
            update as user enrollmentsToUpdate;
        }
        if (!certificatesToInsert.isEmpty()) {
            insert as user certificatesToInsert;
        }
    }

    @AuraEnabled(cacheable=true)
    public static Integer getCertificatesIssuedThisMonth() {
        return [SELECT COUNT() FROM Certificate__c WHERE Enrollment__r.Training__r.OwnerId = :UserInfo.getUserId() AND Issue_Date__c = THIS_MONTH];
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getEnrollmentsPerMonth() {
        List<Map<String, Object>> result = new List<Map<String, Object>>();
        Integer currentYear = Date.today().year();
        Id currentUserId = UserInfo.getUserId();
        
        List<AggregateResult> aggResults = [
            SELECT CALENDAR_MONTH(Enrollment_Date__c) monthNum, COUNT(Id) recordCount
            FROM Enrollment__c
            WHERE CALENDAR_YEAR(Enrollment_Date__c) = :currentYear AND Training__r.OwnerId = :currentUserId
            GROUP BY CALENDAR_MONTH(Enrollment_Date__c)
            ORDER BY CALENDAR_MONTH(Enrollment_Date__c)
        ];

        Map<Integer, String> monthNames = new Map<Integer, String>{
            1 => 'Sty', 2 => 'Lut', 3 => 'Mar', 4 => 'Kwi', 5 => 'Maj', 6 => 'Cze',
            7 => 'Lip', 8 => 'Sie', 9 => 'Wrz', 10 => 'Paź', 11 => 'Lis', 12 => 'Gru'
        };

        for (AggregateResult ar : aggResults) {
            Integer mNum = (Integer)ar.get('monthNum');
            result.add(new Map<String, Object>{
                'month' => monthNames.get(mNum),
                'value' => (Integer)ar.get('recordCount')
            });
        }
        return result;
    }

@AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getTrainingFormats() {
        List<Map<String, Object>> result = new List<Map<String, Object>>();
        Id currentUserId = UserInfo.getUserId();
        
        List<AggregateResult> aggResults = [
            SELECT Format__c, COUNT(Id) recordCount
            FROM Training__c
            // ZMIANA: 'Aktywne', 'Planowane' na 'Active', 'Planned'
            WHERE Status__c IN ('Active', 'Planned') AND OwnerId = :currentUserId
            GROUP BY Format__c
        ];

        Map<String, String> formatColors = new Map<String, String>{
            'Stationary' => '#043669',
            'Online'      => '#3b82f6',
            'Hybrid'   => '#93c5fd'
        };

        for (AggregateResult ar : aggResults) {
            String format = (String)ar.get('Format__c');
            result.add(new Map<String, Object>{
                'label' => format,
                'value' => (Integer)ar.get('recordCount'),
                'color' => formatColors.containsKey(format) ? formatColors.get(format) : '#cccccc'
            });
        }
        return result;
    }
}