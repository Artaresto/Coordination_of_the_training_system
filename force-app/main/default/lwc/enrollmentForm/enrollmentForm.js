import { LightningElement, api, track } from 'lwc';
import enrollParticipant from '@salesforce/apex/EnrollmentController.enrollParticipant';

export default class EnrollmentForm extends LightningElement {

    @api trainingId;
    @api trainingName;
    @api prerequisiteInfo;   // tekst od koordynatora; puste = brak wymagań

    @track isLoading = false;
    @track isSuccess = false;
    @track isWaitlisted = false;
    @track isPending = false;
    @track errorMessage = '';

    fileName = '';
    base64Data = '';

    get hasPrerequisite() {
        return this.prerequisiteInfo && this.prerequisiteInfo.trim().length > 0;
    }

    get isDone() {
        return this.isSuccess || this.isWaitlisted || this.isPending || this.errorMessage;
    }

    get confirmDisabled() {
        return this.isLoading || (this.hasPrerequisite && !this.base64Data);
    }

    handleFileChange(event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;
        if (file.size > 3 * 1024 * 1024) {
            this.errorMessage = 'The file is too large (max 3 MB).';
            return;
        }
        this.errorMessage = '';
        this.fileName = file.name;
        const reader = new FileReader();
        reader.onload = () => { this.base64Data = reader.result.split(',')[1]; };
        reader.readAsDataURL(file);
    }

    handleConfirm() {
        this.isLoading = true;
        enrollParticipant({
            trainingId: this.trainingId,
            fileName: this.fileName,
            base64Data: this.base64Data
        })
            .then(result => {
                this.isLoading = false;
                if (result === 'Enrolled')              this.isSuccess = true;
                else if (result === 'Waitlisted')       this.isWaitlisted = true;
                else if (result === 'Pending Approval') this.isPending = true;
            })
            .catch(error => {
                this.isLoading = false;
                let msg = 'Enrollment failed.';
                if (error && error.body && error.body.message) msg = error.body.message;
                else if (error && error.message) msg = error.message;
                this.errorMessage = msg;
                // eslint-disable-next-line no-console
                console.error('enroll error', JSON.stringify(error));
            });
    }

    handleClose() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    handleOverlayClick(event) {
        if (event.target === event.currentTarget) this.handleClose();
    }
}