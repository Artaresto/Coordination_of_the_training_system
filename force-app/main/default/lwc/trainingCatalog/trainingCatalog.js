import { LightningElement, track } from 'lwc';
import getTrainings from '@salesforce/apex/TrainingCatalogController.getTrainings';

export default class TrainingCatalog extends LightningElement {

    @track trainings = [];
    @track filterFormat = '';
    searchTerm = '';
    @track showEnrollForm = false;
    @track selectedTrainingId = '';
    @track selectedTrainingName = '';

    formatOptions = [
        { label: 'All formats', value: '' },
        { label: 'Stationary', value: 'Stationary' },
        { label: 'Online', value: 'Online' },
        { label: 'Hybrid', value: 'Hybrid' }
    ];

    get trainingCount() {
        return this.trainings.length;
    }

    connectedCallback() {
        this.loadTrainings();
    }

    loadTrainings() {
        getTrainings({ searchTerm: this.searchTerm, format: this.filterFormat })
            .then(result => { this.trainings = result; })
            .catch(error => { console.error(error); });
    }

    handleSearch(event) {
        this.searchTerm = event.target.value;
        this.loadTrainings();
    }

    handleFormatChange(event) {
        this.filterFormat = event.target.value;
        this.loadTrainings();
    }

    handleEnroll(event) {
        const trainingId = event.target.dataset.id;
        const training = this.trainings.find(t => t.Id === trainingId);
        this.selectedTrainingId = trainingId;
        this.selectedTrainingName = training ? training.Name : '';
        this.showEnrollForm = true;
    }

    handleCloseModal() {
        this.showEnrollForm = false;
        this.loadTrainings(); // odśwież liczbę wolnych miejsc
    }
}