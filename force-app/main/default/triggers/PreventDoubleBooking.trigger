trigger PreventDoubleBooking on Training__c (before insert, before update) {
    
    // 1. Zbieramy ID właścicieli (Koordynatorów), którzy dodają/edytują szkolenia
    Set<Id> ownerIds = new Set<Id>();
    for(Training__c t : Trigger.new) {
        if(t.Start_Date__c != null && t.End_Date__c != null) {
            ownerIds.add(t.OwnerId);
        }
    }

    if(ownerIds.isEmpty()) return;

    // 2. Pobieramy wszystkie istniejące szkolenia tych Koordynatorów
    List<Training__c> existingTrainings = [
        SELECT Id, Name, OwnerId, Start_Date__c, End_Date__c 
        FROM Training__c 
        WHERE OwnerId IN :ownerIds 
        // Opcjonalnie: ignorujemy szkolenia, które zostały odwołane
        AND Status__c != 'Cancelled'
    ];

    // 3. Sprawdzamy, czy daty się nakładają
    for(Training__c newTraining : Trigger.new) {
        if(newTraining.Start_Date__c != null && newTraining.End_Date__c != null) {
            
            for(Training__c existing : existingTrainings) {
                // Pomijamy sprawdzanie szkolenia z samym sobą (przy edycji)
                if(Trigger.isUpdate && newTraining.Id == existing.Id) continue;
                
                // Logika nakładania się dat: Start_A <= Koniec_B ORAZ Koniec_A >= Start_B
                if(newTraining.OwnerId == existing.OwnerId &&
                   newTraining.Start_Date__c <= existing.End_Date__c &&
                   newTraining.End_Date__c >= existing.Start_Date__c) {
                    
                    // Wyrzucamy błąd, który zablokuje zapis i pokaże się na ekranie!
                    newTraining.addError('Nie możesz utworzyć szkolenia w tym terminie. Masz już zaplanowane szkolenie: ' + existing.Name);
                }
            }
        }
    }
}