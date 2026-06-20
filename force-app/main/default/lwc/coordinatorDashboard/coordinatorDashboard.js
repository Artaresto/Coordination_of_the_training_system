import { NavigationMixin } from 'lightning/navigation';
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import { deleteRecord } from 'lightning/uiRecordApi';
import getMyTrainings from '@salesforce/apex/CoordinatorDashboardController.getMyTrainings';
import getPendingEnrollments from '@salesforce/apex/CoordinatorDashboardController.getPendingEnrollments';
import getTrainingsEndingSoon from '@salesforce/apex/CoordinatorDashboardController.getTrainingsEndingSoon';
import getCertificatesIssuedThisMonth from '@salesforce/apex/CoordinatorDashboardController.getCertificatesIssuedThisMonth';
import getTrainingParticipants from '@salesforce/apex/CoordinatorDashboardController.getTrainingParticipants';
import generateCertificates from '@salesforce/apex/CoordinatorDashboardController.generateCertificates';
import updateEnrollmentStatus from '@salesforce/apex/CoordinatorDashboardController.updateEnrollmentStatus';
import getEnrollmentsPerMonth from '@salesforce/apex/CoordinatorDashboardController.getEnrollmentsPerMonth';
import getTrainingFormats from '@salesforce/apex/CoordinatorDashboardController.getTrainingFormats';
const ENROLLMENT_ACTIONS = [
    { label: 'Zatwierdź', name: 'accept', iconName: 'utility:check' },
    { label: 'Odrzuć', name: 'reject', iconName: 'utility:close' },
    { label: 'Przenieś z listy i zapisz', name: 'move_from_waitlist', iconName: 'utility:add' }
];

export default class CoordinatorDashboard extends NavigationMixin(LightningElement) {    @track activeTrainings = [];
    @track plannedTrainings = [];
    @track completedTrainings = [];
    
    @track pendingEnrollments = [];
    @track trainingsEndingSoon = [];
    @track certificatesCount = 0;
    
    @track isCertPreviewOpen = false;
    @track certPreviewUrl = '';
    @track certPreviewTitle = '';

    // Zmienne dla Modali
    @track isTrainingModalOpen = false;
    @track isParticipantsModalOpen = false;
    monthlyData = [];          // Ta linijka naprawi błąd ze zdjęcia!
    endingSoonTrainings = [];  // To zapobiegnie kolejnemu błędowi
    formatLegend = [];         // To też
    hasEndingSoon = false;
    pieChartStyle = '';
    // Zmienne dla Listy Uczestników
    @track participantsList = [];
    @track selectedParticipants = [];
    selectedTrainingId = null;

    wiredTrainingsResult;
    wiredEnrollmentsResult;
    wiredEndingSoonResult;
    wiredCertificatesResult;

    enrollmentColumns = [
    { label: 'Status',      fieldName: 'Status__c',          type: 'text', initialWidth: 160 },
    { label: 'Uczestnik',   fieldName: 'ParticipantName',     type: 'text' },
    { label: 'Szkolenie',   fieldName: 'TrainingName',        type: 'text' },
    { label: 'Data zapisu', fieldName: 'EnrollmentDate', type: 'date', initialWidth: 130 },
    { label: 'Certyfikat',  fieldName: 'FileTitle',           type: 'text', initialWidth: 180 },
    { type: 'action', typeAttributes: { rowActions: this._getRowActions.bind(this) } }
    ];

    _getRowActions(row, doneCallback) {
        const actions = [...ENROLLMENT_ACTIONS];
        if (row.HasFile && row.FileVersionId) {
            actions.unshift({ label: 'Zobacz certyfikat', name: 'view_certificate', iconName: 'utility:attach' });
        }
        doneCallback(actions);
    }       

    participantsColumns = [
        { label: 'Uczestnik', fieldName: 'ParticipantName', type: 'text' },
        { label: 'Status', fieldName: 'Status__c', type: 'text' },
        { label: 'Data zapisu', fieldName: 'Enrollment_Date__c', type: 'date' }
    ];

    get selectedParticipantsCount() {
        return this.selectedParticipants.length;
    }

    get isCertBtnDisabled() {
        return this.selectedParticipants.length === 0;
    }

    @wire(getMyTrainings)
    wiredTrainings(result) {
        this.wiredTrainingsResult = result;
        if (result.data) {
            let active = [], planned = [], completed = [];
            
            result.data.forEach(t => {
                let trainingRecord = { ...t };
                const total = t.Max_Participants__c || 1;
                const current = t.Enrolled_Count__c || 0;
                const percent = Math.round((current / total) * 100);
                trainingRecord.occupancyPercentage = percent;
                trainingRecord.barVariant = percent >= 90 ? 'expired' : (percent >= 75 ? 'warning' : 'base');

                if (t.Status__c === 'Active') active.push(trainingRecord);
                else if (t.Status__c === 'Planed') planned.push(trainingRecord);
                else if (t.Status__c === 'Ended') completed.push(trainingRecord);
            });

            this.activeTrainings = active;
            this.plannedTrainings = planned;
            this.completedTrainings = completed;
        }
    }

    @wire(getPendingEnrollments)
    wiredEnrollments(result) {
        this.wiredEnrollmentsResult = result;
        if (result.data) {
            this.pendingEnrollments = result.data;
        }
    }

    @wire(getTrainingsEndingSoon)
    wiredEndingSoon(result) {
        this.wiredEndingSoonResult = result;
        if (result.data) {
            this.trainingsEndingSoon = result.data;
        }
    }
// --- ZMIENNE DO STATYSTYK I ALERTÓW ---
    endingSoonTrainings = [];
    hasEndingSoon = false;
    monthlyData = [];
    pieChartStyle = 'width: 160px; height: 160px; border-radius: 50%; background: #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';
    formatLegend = [];

    // 1. Pobieranie alertów (Szkolenia kończące się za < 7 dni)
    @wire(getTrainingsEndingSoon)
    wiredEndingSoon({ data, error }) {
        if (data) {
            this.endingSoonTrainings = data;
            this.hasEndingSoon = data.length > 0;
        }
    }

    // 2. Pobieranie danych do Wykresu Słupkowego
    @wire(getEnrollmentsPerMonth)
    wiredMonthly({ data, error }) {
        if (data && data.length > 0) {
            let maxVal = Math.max(...data.map(d => d.value));
            maxVal = maxVal === 0 ? 1 : maxVal; // Zabezpieczenie przed dzieleniem przez zero

            this.monthlyData = data.map(d => ({
                month: d.month,
                value: d.value,
                displayValue: d.value > 0 ? d.value : '',
                barStyle: `height: ${(d.value / maxVal) * 100}%; background-color: #043669; border-radius: 4px 4px 0 0; width: 60%; margin: 0 auto; transition: height 0.5s ease;`
            }));
        }
    }

    // 3. Pobieranie danych do Wykresu Kołowego (generowanie CSS Conic Gradient)
    @wire(getTrainingFormats)
    wiredFormats({ data, error }) {
        if (data && data.length > 0) {
            let total = data.reduce((sum, d) => sum + d.value, 0);
            if (total === 0) return;

            let gradientParts = [];
            let currentPercentage = 0;
            this.formatLegend = [];

            data.forEach(d => {
                let percent = (d.value / total) * 100;
                let nextPercentage = currentPercentage + percent;

                gradientParts.push(`${d.color} ${currentPercentage}% ${nextPercentage}%`);
                currentPercentage = nextPercentage;

                this.formatLegend.push({
                    label: d.label,
                    value: d.value,
                    colorStyle: `background-color: ${d.color}; width: 14px; height: 14px; display: inline-block; margin-right: 8px; border-radius: 3px;`
                });
            });

            this.pieChartStyle = `width: 160px; height: 160px; border-radius: 50%; box-shadow: 0 4px 6px rgba(0,0,0,0.1); background: conic-gradient(${gradientParts.join(', ')});`;
        }
    }
    @wire(getCertificatesIssuedThisMonth)
    wiredCertificates(result) {
        this.wiredCertificatesResult = result;
        if (result.data !== undefined) {
            this.certificatesCount = result.data;
        }
    }

    handleRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;

        if (actionName === 'view_certificate') {
            this.certPreviewTitle = row.FileTitle || 'Certyfikat';
            this.certPreviewUrl = `/sfc/servlet.shepherd/version/download/${row.FileVersionId}`;
            this.isCertPreviewOpen = true;
            return;
        }

        let newStatus = '';
        if (actionName === 'accept' || actionName === 'move_from_waitlist') {
            newStatus = 'Enrolled';
        } else if (actionName === 'reject') {
            newStatus = 'Cancelled';
        }

        updateEnrollmentStatus({ enrollmentId: row.Id, newStatus })
            .then(() => {
                this.showToast('Sukces', `Status zmieniony na: ${newStatus}`, 'success');
                return refreshApex(this.wiredEnrollmentsResult);
            })
            .then(() => refreshApex(this.wiredTrainingsResult))
            .catch(error => this.showToast('Błąd', error.body ? error.body.message : error.message, 'error'));
    }

    closeCertPreview() {
        this.isCertPreviewOpen = false;
        this.certPreviewUrl = '';
        this.certPreviewTitle = '';
    }

    downloadCert() {
        window.open(this.certPreviewUrl, '_blank');
    }

    openTrainingModal() { this.isTrainingModalOpen = true; }
    closeTrainingModal() { this.isTrainingModalOpen = false; }

    openParticipantsModal(event) {
        this.selectedTrainingId = event.target.dataset.id;
        getTrainingParticipants({ trainingId: this.selectedTrainingId })
            .then(result => {
                this.participantsList = result.map(enr => ({
                    ...enr,
                    ParticipantName: enr.Participant__r ? enr.Participant__r.Name : ''
                }));
                this.selectedParticipants = []; 
                this.isParticipantsModalOpen = true;
            })
            .catch(error => this.showToast('Błąd', 'Nie udało się pobrać uczestników.', 'error'));
    }

    closeParticipantsModal() {
        this.isParticipantsModalOpen = false;
        this.selectedTrainingId = null;
    }

handleParticipantSelection(event) {
        const selectedRows = event.detail.selectedRows;
        
        const hasAlreadyCompleted = selectedRows.some(row => row.Status__c === 'Completed');
        
        this.selectedParticipantsCount = selectedRows.length;
        this.selectedEnrollmentIds = selectedRows.map(row => row.Id);

        this.isCertBtnDisabled = selectedRows.length === 0 || hasAlreadyCompleted;
        if (hasAlreadyCompleted) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Uwaga',
                message: 'Zaznaczono osobę, która otrzymała już certyfikat (Completed). Odznacz ją, aby móc wygenerować pozostałe.',
                variant: 'warning'
            }));
        }
    }

    handleGenerateCertificates() {
        const enrollmentIds = this.selectedParticipants.map(row => row.Id);
        
        generateCertificates({ enrollmentIds: enrollmentIds })
            .then(() => {
                this.showToast('Sukces', 'Certyfikaty zostały wygenerowane!', 'success');
                this.closeParticipantsModal();
                refreshApex(this.wiredTrainingsResult);
                refreshApex(this.wiredCertificatesResult);
            })
            .catch(error => this.showToast('Błąd', 'Błąd generowania certyfikatów.', 'error'));
    }

    handleOverlayClick(event) {
        if (event.target === event.currentTarget) {
            this.closeTrainingModal();
        }
    }

    handleTrainingCreateSuccess() {
        this.showToast('Sukces', 'Szkolenie zostało utworzone!', 'success');
        this.closeTrainingModal();
        refreshApex(this.wiredTrainingsResult);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
    stopPropagation(event) {
        event.stopPropagation();
    }
    handleEditTraining(event) {
        const recordId = event.target.dataset.id;
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: recordId,
                objectApiName: 'Training__c',
                actionName: 'edit'
            }
        });
    }

    handleDeleteTraining(event) {
        const recordId = event.target.dataset.id;
        if (confirm('Czy na pewno chcesz trwale usunąć to szkolenie?')) {
            deleteRecord(recordId)
                .then(() => {
                    this.dispatchEvent(new ShowToastEvent({ title: 'Sukces', message: 'Szkolenie usunięte', variant: 'success' }));

                    return refreshApex(this.wiredActiveTrainings); 
                })
                .catch(error => {
                    this.dispatchEvent(new ShowToastEvent({ title: 'Błąd usunięcia', message: error.body.message, variant: 'error' }));
                });
        }
    }
}