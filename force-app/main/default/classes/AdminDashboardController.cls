public with sharing class AdminDashboardController {

    // --- PRZEGLAD ---

    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getOverviewStats() {
        Map<String, Object> stats = new Map<String, Object>();

        stats.put('totalTrainings', [SELECT COUNT() FROM Training__c]);
        stats.put('activeTrainings', [SELECT COUNT() FROM Training__c WHERE Status__c = 'Active']);
        stats.put('plannedTrainings', [SELECT COUNT() FROM Training__c WHERE Status__c = 'Planed']);
        stats.put('endedTrainings', [SELECT COUNT() FROM Training__c WHERE Status__c = 'Ended']);
        stats.put('totalEnrollments', [SELECT COUNT() FROM Enrollment__c WHERE Status__c != 'Cancelled']);
        stats.put('certificatesThisMonth', [SELECT COUNT() FROM Certificate__c WHERE Issue_Date__c = THIS_MONTH]);
        stats.put('totalRooms', [SELECT COUNT() FROM Room__c]);
        stats.put('totalTrainers', [SELECT COUNT() FROM Trainer__c]);

        Set<Id> coordinatorIds = new Set<Id>();
        for (AggregateResult ar : [SELECT OwnerId FROM Training__c GROUP BY OwnerId]) {
            coordinatorIds.add((Id) ar.get('OwnerId'));
        }
        stats.put('totalCoordinators', coordinatorIds.size());

        return stats;
    }

    // --- WSZYSTKIE SZKOLENIA (cala organizacja) ---

    public class TrainingRow {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String trainingName;
        @AuraEnabled public String ownerName;
        @AuraEnabled public String status;
        @AuraEnabled public String format;
        @AuraEnabled public Datetime startDate;
        @AuraEnabled public Datetime endDate;
        @AuraEnabled public String location;
        @AuraEnabled public String roomName;
        @AuraEnabled public Decimal maxParticipants;
        @AuraEnabled public Decimal enrolledCount;
        @AuraEnabled public Integer sessionsCount;
    }

    @AuraEnabled(cacheable=true)
    public static List<TrainingRow> getAllTrainings() {
        List<TrainingRow> rows = new List<TrainingRow>();

        for (Training__c t : [
            SELECT Id, Name, Owner.Name, Status__c, Format__c, Start_Date__c, End_Date__c,
                   Location__c, Room__r.Name, Max_Participants__c, Enrolled_Count__c,
                   (SELECT Id FROM Training_Sessions__r)
            FROM Training__c
            WITH SECURITY_ENFORCED
            ORDER BY Start_Date__c DESC
        ]) {
            TrainingRow row = new TrainingRow();
            row.recordId = t.Id;
            row.trainingName = t.Name;
            row.ownerName = t.Owner != null ? t.Owner.Name : '';
            row.status = t.Status__c;
            row.format = t.Format__c;
            row.startDate = t.Start_Date__c;
            row.endDate = t.End_Date__c;
            row.location = t.Location__c;
            row.roomName = t.Room__r != null ? t.Room__r.Name : '';
            row.maxParticipants = t.Max_Participants__c;
            row.enrolledCount = t.Enrolled_Count__c;
            row.sessionsCount = t.Training_Sessions__r != null ? t.Training_Sessions__r.size() : 0;
            rows.add(row);
        }

        return rows;
    }

    // --- SALE ---

    public class RoomRow {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String roomName;
        @AuraEnabled public String location;
        @AuraEnabled public Decimal maxCapacity;
        @AuraEnabled public Boolean hasComputers;
        @AuraEnabled public Integer usageCount; // ile szkolen korzysta z tej sali
    }

    @AuraEnabled(cacheable=true)
    public static List<RoomRow> getRooms() {
        // Liczymy, ile szkolen (ktore sie jeszcze nie zakonczyly) uzywa danej sali
        Map<Id, Integer> usageByRoom = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Room__c roomId, COUNT(Id) cnt
            FROM Training__c
            WHERE Room__c != null AND Status__c != 'Ended'
            GROUP BY Room__c
        ]) {
            usageByRoom.put((Id) ar.get('roomId'), (Integer) ar.get('cnt'));
        }

        List<RoomRow> rows = new List<RoomRow>();
        for (Room__c r : [SELECT Id, Name, Location__c, Max_Capacity__c, Has_computers__c
                          FROM Room__c WITH SECURITY_ENFORCED ORDER BY Location__c ASC, Name ASC]) {
            RoomRow row = new RoomRow();
            row.recordId = r.Id;
            row.roomName = r.Name;
            row.location = r.Location__c;
            row.maxCapacity = r.Max_Capacity__c;
            row.hasComputers = r.Has_computers__c;
            row.usageCount = usageByRoom.containsKey(r.Id) ? usageByRoom.get(r.Id) : 0;
            rows.add(row);
        }
        return rows;
    }

    @AuraEnabled
    public static void deleteRoom(Id roomId) {
        try {
            delete as user [SELECT Id FROM Room__c WHERE Id = :roomId LIMIT 1];
        } catch (DmlException dmlEx) {
            throw new AuraHandledException(dmlEx.getDmlMessage(0));
        } catch (Exception ex) {
            throw new AuraHandledException(ex.getMessage());
        }
    }

    // --- TRENERZY ---

    public class TrainerRow {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String trainerName;
        @AuraEnabled public String specialization;
        @AuraEnabled public String email;
        @AuraEnabled public String phone;
        @AuraEnabled public Boolean isAvailable;
        @AuraEnabled public Integer usageCount; // ile szkolen prowadzi ten trener
    }

    @AuraEnabled(cacheable=true)
    public static List<TrainerRow> getTrainers() {
        Map<Id, Integer> usageByTrainer = new Map<Id, Integer>();
        for (AggregateResult ar : [
            SELECT Trainer__c trainerId, COUNT(Id) cnt
            FROM Training__c
            WHERE Trainer__c != null AND Status__c != 'Ended'
            GROUP BY Trainer__c
        ]) {
            usageByTrainer.put((Id) ar.get('trainerId'), (Integer) ar.get('cnt'));
        }

        List<TrainerRow> rows = new List<TrainerRow>();
        for (Trainer__c tr : [SELECT Id, Name, Specialization__c, Email__c, Phone__c, Avaiable__c
                              FROM Trainer__c WITH SECURITY_ENFORCED ORDER BY Name ASC]) {
            TrainerRow row = new TrainerRow();
            row.recordId = tr.Id;
            row.trainerName = tr.Name;
            row.specialization = tr.Specialization__c;
            row.email = tr.Email__c;
            row.phone = tr.Phone__c;
            row.isAvailable = tr.Avaiable__c;
            row.usageCount = usageByTrainer.containsKey(tr.Id) ? usageByTrainer.get(tr.Id) : 0;
            rows.add(row);
        }
        return rows;
    }

    @AuraEnabled
    public static void deleteTrainer(Id trainerId) {
        try {
            delete as user [SELECT Id FROM Trainer__c WHERE Id = :trainerId LIMIT 1];
        } catch (DmlException dmlEx) {
            throw new AuraHandledException(dmlEx.getDmlMessage(0));
        } catch (Exception ex) {
            throw new AuraHandledException(ex.getMessage());
        }
    }

    // --- ANALIZA (cala organizacja, nie tylko jeden koordynator) ---

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getEnrollmentsPerMonth() {
        List<Map<String, Object>> result = new List<Map<String, Object>>();
        Integer currentYear = Date.today().year();

        List<AggregateResult> aggResults = [
            SELECT CALENDAR_MONTH(Enrollment_Date__c) monthNum, COUNT(Id) recordCount
            FROM Enrollment__c
            WHERE CALENDAR_YEAR(Enrollment_Date__c) = :currentYear
            GROUP BY CALENDAR_MONTH(Enrollment_Date__c)
            ORDER BY CALENDAR_MONTH(Enrollment_Date__c)
        ];

        Map<Integer, String> monthNames = new Map<Integer, String>{
            1 => 'Sty', 2 => 'Lut', 3 => 'Mar', 4 => 'Kwi', 5 => 'Maj', 6 => 'Cze',
            7 => 'Lip', 8 => 'Sie', 9 => 'Wrz', 10 => 'Paz', 11 => 'Lis', 12 => 'Gru'
        };

        for (AggregateResult ar : aggResults) {
            Integer mNum = (Integer) ar.get('monthNum');
            result.add(new Map<String, Object>{
                'month' => monthNames.get(mNum),
                'value' => (Integer) ar.get('recordCount')
            });
        }
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getTrainingFormats() {
        List<Map<String, Object>> result = new List<Map<String, Object>>();

        List<AggregateResult> aggResults = [
            SELECT Format__c, COUNT(Id) recordCount
            FROM Training__c
            WHERE Status__c IN ('Active', 'Planed')
            GROUP BY Format__c
        ];

        Map<String, String> formatColors = new Map<String, String>{
            'Stationary' => '#043669',
            'Online'     => '#3b82f6',
            'Hybrid'     => '#93c5fd'
        };

        for (AggregateResult ar : aggResults) {
            String fmt = (String) ar.get('Format__c');
            result.add(new Map<String, Object>{
                'label' => fmt,
                'value' => (Integer) ar.get('recordCount'),
                'color' => formatColors.containsKey(fmt) ? formatColors.get(fmt) : '#cccccc'
            });
        }
        return result;
    }

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getTopCoordinators() {
        List<Map<String, Object>> result = new List<Map<String, Object>>();

        List<AggregateResult> aggResults = [
            SELECT OwnerId, Owner.Name ownerName, COUNT(Id) recordCount
            FROM Training__c
            GROUP BY OwnerId, Owner.Name
            ORDER BY COUNT(Id) DESC
            LIMIT 5
        ];

        for (AggregateResult ar : aggResults) {
            result.add(new Map<String, Object>{
                'name' => (String) ar.get('ownerName'),
                'count' => (Integer) ar.get('recordCount')
            });
        }
        return result;
    }
}
