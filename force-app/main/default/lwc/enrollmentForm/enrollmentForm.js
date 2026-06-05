import { LightningElement, api, track } from 'lwc';
import enrollParticipant from '@salesforce/apex/EnrollmentController.enrollParticipant';

export default class EnrollmentForm extends LightningElement {

    @api trainingId;
    @api trainingName;

    @track isLoading = false;
    @track isSuccess = false;
    @track isWaitlisted = false;
    @track errorMessage = '';

    get isDone() {
        return this.isSuccess || this.isWaitlisted || this.errorMessage;
    }

    handleConfirm() {
        this.isLoading = true;
        enrollParticipant({ trainingId: this.trainingId })
            .then(result => {
                this.isLoading = false;
                if (result === 'Enrolled')   this.isSuccess = true;
                if (result === 'Waitlisted') this.isWaitlisted = true;
            })
            .catch(error => {
                this.isLoading = false;
                this.errorMessage = error.body.message;
            });
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleOverlayClick(event) {
        if (event.target === event.currentTarget) this.handleClose();
    }
}