import { NavigationMixin } from 'lightning/navigation';
import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import deleteTraining from '@salesforce/apex/TrainingFormController.deleteTraining';
import getMyTrainings from '@salesforce/apex/CoordinatorDashboardController.getMyTrainings';
import getPendingEnrollments from '@salesforce/apex/CoordinatorDashboardController.getPendingEnrollments';
import getCertificatesIssuedThisMonth from '@salesforce/apex/CoordinatorDashboardController.getCertificatesIssuedThisMonth';
import getTrainingParticipants from '@salesforce/apex/CoordinatorDashboardController.getTrainingParticipants';
import generateCertificates from '@salesforce/apex/CoordinatorDashboardController.generateCertificates';
import updateEnrollmentStatus from '@salesforce/apex/CoordinatorDashboardController.updateEnrollmentStatus';
import getEnrollmentsPerMonth from '@salesforce/apex/CoordinatorDashboardController.getEnrollmentsPerMonth';
import getTrainingFormats from '@salesforce/apex/CoordinatorDashboardController.getTrainingFormats';
import getTrainingsEndingSoon from '@salesforce/apex/CoordinatorDashboardController.getTrainingsEndingSoon';
import getCancelledEnrollments from '@salesforce/apex/CoordinatorDashboardController.getCancelledEnrollments';
import unlockEnrollment from '@salesforce/apex/CoordinatorDashboardController.unlockEnrollment';

const ENROLLMENT_ACTIONS = [
    { label: 'Zatwierdź', name: 'accept', iconName: 'utility:check' },
    { label: 'Odrzuć', name: 'reject', iconName: 'utility:close' },
    { label: 'Przenieś z listy i zapisz', name: 'move_from_waitlist', iconName: 'utility:add' }
];

export default class CoordinatorDashboard extends NavigationMixin(LightningElement) {

    @track activeTrainings = [];
    @track plannedTrainings = [];
    @track completedTrainings = [];

    @track pendingEnrollments = [];
    @track certificatesCount = 0;

    @track isCertPreviewOpen = false;
    @track certPreviewUrl = '';
    @track certPreviewTitle = '';

    // Zmienne dla Modali
    @track isTrainingModalOpen = false;
    @track isParticipantsModalOpen = false;

    @track endingSoonTrainings = [];
    @track hasEndingSoon = false;
    @track monthlyData = [];
    @track formatLegend = [];
    pieChartStyle = 'width: 160px; height: 160px; border-radius: 50%; background: #e5e7eb; box-shadow: 0 4px 6px rgba(0,0,0,0.1);';

    // Zmienne dla Listy Uczestników (modal "Zarządzaj uczestnikami")
    @track allParticipants = [];      // wszyscy uczestnicy danego szkolenia
    @track cancelledParticipants = [];
    @track selectedParticipants = []; // zaznaczeni do wystawienia certyfikatu (tylko z zakładki "Do ukończenia")
    @track participantsActiveTab = 'pending'; // 'pending' | 'completed'
    selectedTrainingId = null;

    wiredEnrollmentsResult;
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

    completedParticipantsColumns = [
        { label: 'Uczestnik', fieldName: 'ParticipantName', type: 'text' },
        { label: 'Data zapisu', fieldName: 'Enrollment_Date__c', type: 'date' }
    ];

    cancelledParticipantsColumns = [
        { label: 'Uczestnik', fieldName: 'ParticipantName', type: 'text' },
        { label: 'Data rezygnacji', fieldName: 'Enrollment_Date__c', type: 'date', initialWidth: 160 },
        { label: 'Odblokowany', fieldName: 'unlockedLabel', type: 'text', initialWidth: 130 },
        {
            type: 'button',
            initialWidth: 140,
            typeAttributes: {
                label: 'Odblokuj',
                name: 'unlock',
                variant: 'brand',
                disabled: { fieldName: 'isAlreadyUnlocked' }
            }
        }
    ];

    connectedCallback() {
        this.loadTrainings();
    }

    get selectedParticipantsCount() {
        return this.selectedParticipants.length;
    }

    get isCertBtnDisabled() {
        return this.selectedParticipants.length === 0;
    }

    // Uczestnicy oczekujący na certyfikat (jeszcze nie "Completed")
    get pendingParticipants() {
        return this.allParticipants.filter(p => p.Status__c !== 'Completed');
    }

    // Uczestnicy, którzy już ukończyli szkolenie / mają certyfikat
    get completedParticipants() {
        return this.allParticipants.filter(p => p.Status__c === 'Completed');
    }

    get hasCompletedParticipants() {
        return this.completedParticipants.length > 0;
    }

    get isPendingTabActive() {
        return this.participantsActiveTab === 'pending';
    }

    get isCompletedTabActive() {
        return this.participantsActiveTab === 'completed';
    }

    get pendingTabClass() {
        return this.isPendingTabActive ? 'tms-subtab tms-subtab--active' : 'tms-subtab';
    }

    get completedTabClass() {
        return this.isCompletedTabActive ? 'tms-subtab tms-subtab--active' : 'tms-subtab';
    }

    showPendingTab() {
        this.participantsActiveTab = 'pending';
    }

    showCompletedTab() {
        this.participantsActiveTab = 'completed';
    }

    get isCancelledTabActive() {
        return this.participantsActiveTab === 'cancelled';
    }

    get cancelledTabClass() {
        return this.isCancelledTabActive ? 'tms-subtab tms-subtab--active' : 'tms-subtab';
    }

    showCancelledTab() {
        this.participantsActiveTab = 'cancelled';
    }

    // getMyTrainings NIE jest cacheable (wykonuje DML, żeby przeliczyć status na podstawie dat),
    // więc nie może być użyte przez @wire (wire wymaga cacheable=true) - wywołujemy ją imperatywnie.
    loadTrainings() {
        getMyTrainings()
            .then(data => {
                let active = [], planned = [], completed = [];

                data.forEach(t => {
                    let trainingRecord = { ...t };
                    const total = t.Max_Participants__c || 1;
                    const current = t.Enrolled_Count__c || 0;
                    const percent = Math.round((current / total) * 100);
                    trainingRecord.occupancyPercentage = percent;
                    trainingRecord.barVariant = percent >= 90 ? 'expired' : (percent >= 75 ? 'warning' : 'base');

                    const sessions = (t.Training_Sessions__r || []).map(s => ({ ...s }));
                    trainingRecord.sessionsCount = sessions.length;
                    trainingRecord.hasMultipleSessions = sessions.length > 1;
                    trainingRecord.sessionsLabel = sessions.length > 1
                        ? `${sessions.length} terminów`
                        : (sessions.length === 1 ? '1 termin' : '');

                    if (t.Status__c === 'Active') active.push(trainingRecord);
                    else if (t.Status__c === 'Planed') planned.push(trainingRecord);
                    else if (t.Status__c === 'Ended') completed.push(trainingRecord);
                });

                this.activeTrainings = active;
                this.plannedTrainings = planned;
                this.completedTrainings = completed;
            })
            .catch(error => {
                this.activeTrainings = [];
                this.plannedTrainings = [];
                this.completedTrainings = [];
                this.showToast(
                    'Błąd wczytywania szkoleń',
                    error.body ? error.body.message : 'Nie udało się pobrać listy szkoleń.',
                    'error'
                );
            });
    }

    @wire(getPendingEnrollments)
    wiredEnrollments(result) {
        this.wiredEnrollmentsResult = result;
        if (result.data) {
            this.pendingEnrollments = result.data;
        }
    }

    // Alerty: szkolenia kończące się w ciągu 7 dni
    @wire(getTrainingsEndingSoon)
    wiredEndingSoon({ data }) {
        if (data) {
            this.endingSoonTrainings = data;
            this.hasEndingSoon = data.length > 0;
        }
    }

    // Dane do wykresu słupkowego (zapisy per miesiąc)
    @wire(getEnrollmentsPerMonth)
    wiredMonthly({ data }) {
        if (data && data.length > 0) {
            let maxVal = Math.max(...data.map(d => d.value));
            maxVal = maxVal === 0 ? 1 : maxVal;

            this.monthlyData = data.map(d => ({
                month: d.month,
                value: d.value,
                displayValue: d.value > 0 ? d.value : '',
                barStyle: `height: ${(d.value / maxVal) * 100}%; background-color: #043669; border-radius: 4px 4px 0 0; width: 60%; margin: 0 auto; transition: height 0.5s ease;`
            }));
        }
    }

    // Dane do wykresu kołowego formatów szkoleń (CSS conic-gradient)
    @wire(getTrainingFormats)
    wiredFormats({ data }) {
        if (data && data.length > 0) {
            let total = data.reduce((sum, d) => sum + d.value, 0);
            if (total === 0) return;

            let gradientParts = [];
            let currentPercentage = 0;
            const legend = [];

            data.forEach(d => {
                let percent = (d.value / total) * 100;
                let nextPercentage = currentPercentage + percent;

                gradientParts.push(`${d.color} ${currentPercentage}% ${nextPercentage}%`);
                currentPercentage = nextPercentage;

                legend.push({
                    label: d.label,
                    value: d.value,
                    colorStyle: `background-color: ${d.color}; width: 14px; height: 14px; display: inline-block; margin-right: 8px; border-radius: 3px;`
                });
            });

            this.formatLegend = legend;
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
            .then(() => this.loadTrainings())
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
        this.participantsActiveTab = 'pending';
        getTrainingParticipants({ trainingId: this.selectedTrainingId })
            .then(result => {
                this.allParticipants = result.map(enr => ({
                    ...enr,
                    ParticipantName: enr.Participant__r ? enr.Participant__r.Name : ''
                }));
                this.selectedParticipants = [];
                return getCancelledEnrollments({ trainingId: this.selectedTrainingId });
            })
            .then(cancelled => {
                this.cancelledParticipants = cancelled.map(enr => ({
                    ...enr,
                    ParticipantName: enr.Participant__r ? enr.Participant__r.Name : '',
                    isAlreadyUnlocked: enr.Cancellation_Unlocked__c === true,
                    unlockedLabel: enr.Cancellation_Unlocked__c ? 'Tak' : 'Nie'
                }));
                this.isParticipantsModalOpen = true;
            })
            .catch(() => this.showToast('Błąd', 'Nie udało się pobrać uczestników.', 'error'));
    }

    closeParticipantsModal() {
        this.isParticipantsModalOpen = false;
        this.selectedTrainingId = null;
        this.allParticipants = [];
        this.cancelledParticipants = [];
        this.selectedParticipants = [];
    }

    handleCancelledRowAction(event) {
        const actionName = event.detail.action.name;
        const row = event.detail.row;
        if (actionName === 'unlock') {
            unlockEnrollment({ enrollmentId: row.Id })
                .then(() => {
                    this.showToast('Sukces', `Odblokowano możliwość ponownego zapisu dla: ${row.ParticipantName}`, 'success');
                    return getCancelledEnrollments({ trainingId: this.selectedTrainingId });
                })
                .then(cancelled => {
                    this.cancelledParticipants = cancelled.map(enr => ({
                        ...enr,
                        ParticipantName: enr.Participant__r ? enr.Participant__r.Name : '',
                        isAlreadyUnlocked: enr.Cancellation_Unlocked__c === true,
                        unlockedLabel: enr.Cancellation_Unlocked__c ? 'Tak' : 'Nie'
                    }));
                })
                .catch(error => this.showToast('Błąd', error.body ? error.body.message : 'Błąd odblokowania.', 'error'));
        }
    }

    handleParticipantSelection(event) {
        this.selectedParticipants = event.detail.selectedRows;
    }

    handleGenerateCertificates() {
        const enrollmentIds = this.selectedParticipants.map(row => row.Id);

        generateCertificates({ enrollmentIds })
            .then(() => {
                this.showToast('Sukces', 'Certyfikaty zostały wygenerowane, a status uczestników zmieniony na "Ukończono"!', 'success');
                this.closeParticipantsModal();
                this.loadTrainings();
                refreshApex(this.wiredCertificatesResult);
            })
            .catch(error => this.showToast('Błąd', error.body ? error.body.message : 'Błąd generowania certyfikatów.', 'error'));
    }

    handleOverlayClick(event) {
        if (event.target === event.currentTarget) {
            this.closeTrainingModal();
        }
    }

    handleTrainingCreateSuccess() {
        this.showToast('Sukces', 'Szkolenie zostało utworzone!', 'success');
        this.closeTrainingModal();
        this.loadTrainings();
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
            deleteTraining({ trainingId: recordId })
                .then(() => {
                    this.showToast('Sukces', 'Szkolenie usunięte', 'success');
                    this.loadTrainings();
                })
                .catch(error => {
                    this.showToast('Błąd usunięcia', error.body ? error.body.message : error.message, 'error');
                });
        }
    }
}
