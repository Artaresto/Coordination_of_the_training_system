public class TrainingStatusScheduler implements Schedulable {

    public void execute(SchedulableContext ctx) {
        TrainingStatusUpdater.updateAllStatuses();
    }

    // Pomocnicze: zaplanowanie cyklicznego uruchamiania co godzinę (24 wpisy w 24 różnych minutach
    // dnia nie są potrzebne - wystarczy jeden CRON co godzinę o pełnej godzinie).
    // Wywołaj raz z Anonymous Apex (Setup -> Developer Console -> Debug -> Open Execute Anonymous Window):
    //
    //   TrainingStatusScheduler.scheduleHourly();
    //
    public static void scheduleHourly() {
        String jobName = 'TrainingStatusScheduler - co godzinę';
        for (CronTrigger ct : [SELECT Id FROM CronTrigger WHERE CronJobDetail.Name = :jobName]) {
            System.abortJob(ct.Id);
        }
        // Co godzinę, o pełnej godzinie (minuta 0)
        System.schedule(jobName, '0 0 * * * ?', new TrainingStatusScheduler());
    }
}
