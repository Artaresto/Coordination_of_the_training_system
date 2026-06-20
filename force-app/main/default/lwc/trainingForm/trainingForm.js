import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDistinctLocations from '@salesforce/apex/TrainingFormController.getDistinctLocations';
import getRoomsByLocation from '@salesforce/apex/TrainingFormController.getRoomsByLocation';

export default class TrainingForm extends LightningElement {

    @track selectedLocation = '';
    @track selectedRoomId = '';
    @track rooms = [];
    @track requiresCertificate = false;
    @track prerequisiteInfo = '';
    emptyOptions = [];
    locationOptions = [];

    @wire(getDistinctLocations)
    wiredLocations({ data, error }) {
        if (data) {
            this.locationOptions = data.map(loc => ({ label: loc, value: loc }));
        } else if (error) {
            console.error('Błąd pobierania lokalizacji:', error);
        }
    }

    @wire(getRoomsByLocation, { location: '$selectedLocation' })
    wiredRooms({ data, error }) {
        if (data) {
            this.rooms = data;
            this.selectedRoomId = '';
        } else if (error) {
            console.error('Błąd pobierania sal:', error);
        }
    }

    get roomOptions() {
        return this.rooms.map(room => ({
            label: room.Name + (room.Max_Capacity__c ? ` (maks. ${room.Max_Capacity__c} os.)` : ''),
            value: room.Id
        }));
    }

    get noRoomsAvailable() {
        return this.selectedLocation && this.rooms.length === 0;
    }

    get roomPlaceholder() {
        return this.rooms.length === 0 ? 'Brak sal w tej lokalizacji' : '-- Wybierz salę --';
    }

    handleCertificateToggle(event) {
        this.requiresCertificate = event.target.checked;
        if (!this.requiresCertificate) {
            this.prerequisiteInfo = '';
        }
    }

    handlePrerequisiteChange(event) {
        this.prerequisiteInfo = event.detail.value;
    }

    handleLocationChange(event) {
        this.selectedLocation = event.detail.value;
        this.selectedRoomId = '';
        this.rooms = [];
    }

    handleRoomChange(event) {
        this.selectedRoomId = event.detail.value;
    }

    handleSubmit(event) {
        event.preventDefault();
        const fields = event.detail.fields;

        const startDate = new Date(fields.Start_Date__c);
        const endDate = new Date(fields.End_Date__c);
        if (endDate <= startDate) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Błąd walidacji',
                message: 'Data zakończenia musi być późniejsza niż data rozpoczęcia.',
                variant: 'error'
            }));
            return;
        }

        if (!this.selectedLocation) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Błąd walidacji',
                message: 'Wybierz lokalizację.',
                variant: 'error'
            }));
            return;
        }

        fields.Location__c = this.selectedLocation;
        if (this.selectedRoomId) {
            fields.Room__c = this.selectedRoomId;
        }

        if (this.requiresCertificate && !this.prerequisiteInfo.trim()) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Błąd walidacji',
                message: 'Podaj opis wymaganego certyfikatu.',
                variant: 'error'
            }));
            return;
        }

        fields.Prerequisite_Info__c = this.requiresCertificate ? this.prerequisiteInfo : '';

        this.template.querySelector('lightning-record-edit-form').submit(fields);
    }

    handleSuccess(event) {
        this.dispatchEvent(new CustomEvent('success', { detail: event.detail.id }));
    }

    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}