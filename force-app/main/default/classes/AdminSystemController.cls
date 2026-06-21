public with sharing class AdminSystemController {

    // --- WSZYSCY UZYTKOWNICY SYSTEMU ---

    public class UserRow {
        @AuraEnabled public Id recordId;
        @AuraEnabled public String fullName;
        @AuraEnabled public String username;
        @AuraEnabled public String profileName;
        @AuraEnabled public String roleName;
        @AuraEnabled public Boolean isActive;
        @AuraEnabled public Datetime lastLogin;
    }

    @AuraEnabled(cacheable=true)
    public static List<UserRow> getSystemUsers() {
        List<UserRow> rows = new List<UserRow>();
        for (User u : [
            SELECT Id, Name, Username, IsActive, LastLoginDate, Profile.Name, UserRole.Name
            FROM User
            WITH SECURITY_ENFORCED
            ORDER BY IsActive DESC, Name ASC
            LIMIT 200
        ]) {
            UserRow row = new UserRow();
            row.recordId = u.Id;
            row.fullName = u.Name;
            row.username = u.Username;
            row.profileName = u.Profile != null ? u.Profile.Name : '';
            row.roleName = u.UserRole != null ? u.UserRole.Name : '(brak roli)';
            row.isActive = u.IsActive;
            row.lastLogin = u.LastLoginDate;
            rows.add(row);
        }
        return rows;
    }

    // --- AKTYWNOSC LOGOWAN ---
    // UWAGA: Salesforce nie udostepnia przez standardowe SOQL pojedynczego pola
    // "MFA wlaczone/wylaczone" dla usera - to ustawienie sesji/zasad bezpieczenstwa,
    // widoczne w Setup -> Your Account -> Advanced User Details, a nie zwykle pole obiektu.
    // Pokazujemy wiec realna historie logowan (LoginHistory), bez zmyslania pola MFA.

    public class LoginRow {
        @AuraEnabled public String userName;
        @AuraEnabled public Datetime loginTime;
        @AuraEnabled public String status;
        @AuraEnabled public String application;
        @AuraEnabled public String browser;
    }

    @AuraEnabled(cacheable=true)
    public static List<LoginRow> getRecentLogins() {
        List<LoginHistory> histories = [
            SELECT UserId, LoginTime, Status, Application, Browser
            FROM LoginHistory
            ORDER BY LoginTime DESC
            LIMIT 50
        ];

        Set<Id> userIds = new Set<Id>();
        for (LoginHistory lh : histories) userIds.add(lh.UserId);

        Map<Id, String> namesByUser = new Map<Id, String>();
        for (User u : [SELECT Id, Name FROM User WHERE Id IN :userIds WITH SECURITY_ENFORCED]) {
            namesByUser.put(u.Id, u.Name);
        }

        List<LoginRow> rows = new List<LoginRow>();
        for (LoginHistory lh : histories) {
            LoginRow row = new LoginRow();
            row.userName = namesByUser.containsKey(lh.UserId) ? namesByUser.get(lh.UserId) : '(nieznany)';
            row.loginTime = lh.LoginTime;
            row.status = lh.Status;
            row.application = lh.Application;
            row.browser = lh.Browser;
            rows.add(row);
        }
        return rows;
    }

    // --- LICZBA REKORDOW PER OBIEKT ---

    @AuraEnabled(cacheable=true)
    public static Map<String, Integer> getObjectRecordCounts() {
        Map<String, Integer> counts = new Map<String, Integer>();
        counts.put('Training__c', [SELECT COUNT() FROM Training__c]);
        counts.put('Enrollment__c', [SELECT COUNT() FROM Enrollment__c]);
        counts.put('Certificate__c', [SELECT COUNT() FROM Certificate__c]);
        counts.put('Trainer__c', [SELECT COUNT() FROM Trainer__c]);
        counts.put('Room__c', [SELECT COUNT() FROM Room__c]);
        counts.put('Training_Session__c', [SELECT COUNT() FROM Training_Session__c]);
        return counts;
    }

    // --- INTEGRACJE / NAMED CREDENTIALS ---
    // UWAGA: ta aplikacja (TMS) nie posiada zaimplementowanych zadnych zewnetrznych
    // integracji REST/SOAP (brak Named Credentials, brak External Services, brak
    // callout-ow w kodzie Apex). Ponizej pokazujemy RZECZYWISTY stan: liste skonfigurowanych
    // Named Credentials w organizacji (jesli jakies istnieja) - bez zmyslania danych o
    // "liczbie wywolan" czy "bledach polaczenia", bo to wymagaloby Event Monitoring
    // (dodatkowa platna licencja Salesforce Shield), ktorej ta organizacja nie ma.

    @AuraEnabled(cacheable=true)
    public static List<Map<String, String>> getNamedCredentials() {
        List<Map<String, String>> result = new List<Map<String, String>>();
        for (NamedCredential nc : [SELECT MasterLabel, Endpoint FROM NamedCredential]) {
            result.add(new Map<String, String>{
                'label' => nc.MasterLabel,
                'endpoint' => nc.Endpoint
            });
        }
        return result;
    }

    // --- BLEDY APEX (najlepszy dostepny odpowiednik bez Event Monitoring) ---
    // Pokazujemy nieudane zadania asynchroniczne Apex (batch/queueable/scheduled) -
    // to realny, dostepny przez SOQL odpowiednik "logow bledow", bez potrzeby
    // dodatkowych uprawnien do parsowania surowych Debug Logow.

    public class FailedJobRow {
        @AuraEnabled public String jobType;
        @AuraEnabled public String apexClassName;
        @AuraEnabled public String status;
        @AuraEnabled public Datetime completedDate;
        @AuraEnabled public String errorMessage;
    }

    @AuraEnabled(cacheable=true)
    public static List<FailedJobRow> getFailedApexJobs() {
        List<FailedJobRow> rows = new List<FailedJobRow>();
        for (AsyncApexJob job : [
            SELECT JobType, ApexClass.Name, Status, CompletedDate, ExtendedStatus
            FROM AsyncApexJob
            WHERE Status IN ('Failed', 'Aborted')
            ORDER BY CompletedDate DESC
            LIMIT 25
        ]) {
            FailedJobRow row = new FailedJobRow();
            row.jobType = job.JobType;
            row.apexClassName = job.ApexClass != null ? job.ApexClass.Name : '(nieznana klasa)';
            row.status = job.Status;
            row.completedDate = job.CompletedDate;
            row.errorMessage = job.ExtendedStatus;
            rows.add(row);
        }
        return rows;
    }

    // --- PRZYCHOD Z SZKOLEN (per miesiac, biezacy rok) ---
    // Przychod = suma Price__c szkolenia za kazdy nieanulowany zapis (Enrollment__c),
    // pogrupowana wg miesiaca daty zapisu.

    @AuraEnabled(cacheable=true)
    public static List<Map<String, Object>> getRevenuePerMonth() {
        Integer currentYear = Date.today().year();

        Map<Integer, Decimal> revenueByMonth = new Map<Integer, Decimal>();
        for (Integer m = 1; m <= 12; m++) revenueByMonth.put(m, 0);

        for (Enrollment__c e : [
            SELECT Enrollment_Date__c, Training__r.Price__c
            FROM Enrollment__c
            WHERE Status__c != 'Cancelled'
            AND Enrollment_Date__c != null
            AND CALENDAR_YEAR(Enrollment_Date__c) = :currentYear
        ]) {
            Integer m = e.Enrollment_Date__c.month();
            Decimal price = e.Training__r != null && e.Training__r.Price__c != null ? e.Training__r.Price__c : 0;
            revenueByMonth.put(m, revenueByMonth.get(m) + price);
        }

        Map<Integer, String> monthNames = new Map<Integer, String>{
            1 => 'Sty', 2 => 'Lut', 3 => 'Mar', 4 => 'Kwi', 5 => 'Maj', 6 => 'Cze',
            7 => 'Lip', 8 => 'Sie', 9 => 'Wrz', 10 => 'Paz', 11 => 'Lis', 12 => 'Gru'
        };

        List<Map<String, Object>> result = new List<Map<String, Object>>();
        for (Integer m = 1; m <= 12; m++) {
            result.add(new Map<String, Object>{
                'month' => monthNames.get(m),
                'value' => revenueByMonth.get(m)
            });
        }
        return result;
    }
}
