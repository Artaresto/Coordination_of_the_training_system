public class TrainingHandler {

    public static void validateRoomConflicts(
        List<Training__c> newList,
        Map<Id, Training__c> oldMap
    ){

        Set<Id> roomIds = new Set<Id>();

        for(Training__c t : newList){

            if(
                t.Room__c != null &&
                t.Status__c != 'Anulowane'
            ){
                roomIds.add(t.Room__c);
            }
        }

        if(roomIds.isEmpty()){
            return;
        }

        List<Training__c> existingTrainings = [

            SELECT Id,
                   Room__c,
                   Start_Date__c,
                   End_Date__c,
                   Status__c

            FROM Training__c

            WHERE Room__c IN :roomIds
            AND Status__c != 'Anulowane'
        ];

        for(Training__c newTraining : newList){

            if(newTraining.Room__c == null){
                continue;
            }

            for(Training__c existing : existingTrainings){

                if(existing.Id == newTraining.Id){
                    continue;
                }

                Boolean overlap =

                    newTraining.Start_Date__c
                    < existing.End_Date__c

                    &&

                    existing.Start_Date__c
                    < newTraining.End_Date__c;

                if(

                    overlap

                    &&

                    existing.Room__c
                    == newTraining.Room__c

                ){

                    newTraining.addError(
                        'Room already occupied in selected time range'
                    );
                }
            }
        }
    }
}