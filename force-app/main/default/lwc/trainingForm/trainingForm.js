import { LightningElement } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class TrainingForm extends LightningElement {
    
    handleSubmit(event) {
        // Zatrzymujemy standardowe wysłanie, aby przeprowadzić własną walidację
        event.preventDefault(); 
        const fields = event.detail.fields;
        
        // Prosta walidacja dat po stronie frontendu
        const startDate = new Date(fields.Start_Date__c);
        const endDate = new Date(fields.End_Date__c);

        if (endDate <= startDate) {
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Błąd walidacji',
                    message: 'Data zakończenia musi być późniejsza niż data rozpoczęcia.',
                    variant: 'error'
                })
            );
            return; // Przerywamy zapis
        }

        // Jeśli wszystko ok, wznawiamy wysyłanie do bazy
        this.template.querySelector('lightning-record-edit-form').submit(fields);
    }

    handleSuccess(event) {
        // Formularz zapisany w bazie. Wysyłamy event "success" do coordinatorDashboard
        // Przekazujemy ID nowo utworzonego szkolenia w szczegółach (detail)
        this.dispatchEvent(new CustomEvent('success', { detail: event.detail.id }));
    }

    handleCancel() {
        // Użytkownik kliknął Anuluj. Wysyłamy event "cancel" do coordinatorDashboard
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}