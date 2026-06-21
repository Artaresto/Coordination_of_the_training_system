import { LightningElement, track } from 'lwc';
import getTrainings from '@salesforce/apex/TrainingCatalogController.getTrainings';
import isCurrentUserAdmin from '@salesforce/apex/TrainingCatalogController.isCurrentUserAdmin';
import cancelEnrollment from '@salesforce/apex/MyTrainingsController.cancelEnrollment';

export default class TrainingCatalog extends LightningElement {

    @track rawTrainings = [];
    enrollmentStatus = {};
    enrollmentIds = {};

    @track filterFormat = '';
    searchTerm = '';
    @track showEnrollForm = false;
    @track selectedTrainingId = '';
    @track selectedTrainingName = '';
    @track selectedTrainingPrereq = '';
    @track showDetails = false;
    @track detailsTraining = {};
    @track confirmUnenroll = false;
    @track isUnenrolling = false;
    @track unenrollError = '';
    @track sortBy = 'date';

    formatOptions = [
        { label: 'All formats', value: '' },
        { label: 'Stationary', value: 'Stationary' },
        { label: 'Online', value: 'Online' },
        { label: 'Hybrid', value: 'Hybrid' }
    ];

    get trainings() {
        const mapped = this.rawTrainings.map(t => {
            const status = this.enrollmentStatus[t.Id];
            const isEnrolled = status === 'Enrolled';
            const isWaitlisted = status === 'Waitlisted';
            const isCompleted = status === 'Completed';
            const isCancelled = status === 'Cancelled';
            const isPending = status === 'Pending Approval';

            let cardClass = 'tms-card';
            if (isEnrolled) cardClass = 'tms-card tms-card--enrolled';
            else if (isPending) cardClass = 'tms-card tms-card--pending';
            else if (isWaitlisted) cardClass = 'tms-card tms-card--waitlisted';
            else if (isCompleted) cardClass = 'tms-card tms-card--completed';
            else if (isCancelled) cardClass = 'tms-card tms-card--cancelled';

            return {
                ...t,
                isInvolved: !!status,
                statusLabel: isPending ? '⏳ Awaiting approval'
                    : isWaitlisted ? '✓ On waitlist'
                    : isEnrolled ? '✓ Already enrolled'
                    : isCompleted ? '✓ Completed'
                    : isCancelled ? '✕ Cancelled' : '',
                statusLabelClass: isPending
                    ? 'tms-enrolled-label tms-enrolled-label--pending'
                    : isWaitlisted ? 'tms-enrolled-label tms-enrolled-label--waitlisted'
                    : isCompleted ? 'tms-enrolled-label tms-enrolled-label--completed'
                    : isCancelled ? 'tms-enrolled-label tms-enrolled-label--cancelled'
                    : 'tms-enrolled-label',
                trainerName: t.Trainer__r ? t.Trainer__r.Name : null,
                cardClass
            };
        });

        return this.sortTrainings(mapped);
    }

    sortTrainings(list) {
        const statusRank = {
            'Enrolled': 1, 'Pending Approval': 2, 'Waitlisted': 3, 'Completed': 4, 'Cancelled': 6
        };
        const arr = [...list];
        switch (this.sortBy) {
            case 'status':
                arr.sort((a, b) => {
                    const ra = statusRank[this.enrollmentStatus[a.Id]] || 5;
                    const rb = statusRank[this.enrollmentStatus[b.Id]] || 5;
                    if (ra !== rb) return ra - rb;
                    return new Date(a.Start_Date__c) - new Date(b.Start_Date__c);
                });
                break;
            case 'price':
                arr.sort((a, b) => (a.Price__c || 0) - (b.Price__c || 0));
                break;
            case 'spots':
                arr.sort((a, b) => (b.Free_Spots__c || 0) - (a.Free_Spots__c || 0));
                break;
            case 'name':
                arr.sort((a, b) => (a.Name || '').localeCompare(b.Name || ''));
                break;
            default: // 'date'
                arr.sort((a, b) => new Date(a.Start_Date__c) - new Date(b.Start_Date__c));
        }
        return arr;
    }

    handleSortChange(event) {
        this.sortBy = event.target.value;
    }

    get trainingCount() {
        return this.rawTrainings.length;
    }

    connectedCallback() {
        isCurrentUserAdmin()
            .then(isAdmin => {
                if (isAdmin) {
                    // Strony Experience Cloud mają prefiks ścieżki (np. "/s/"), inny niż
                    // sam goły adres origin - liczymy go dynamicznie z bieżącej ścieżki,
                    // zamiast zakładać na sztywno "/s/" (poprzedni błąd: brak prefiksu
                    // powodował "URL No Longer Exists").
                    const pathSegments = window.location.pathname.split('/').filter(Boolean);
                    const sitePrefix = pathSegments.length > 0 ? '/' + pathSegments[0] : '';
                    window.location.href = `${sitePrefix}/admindashboard`;
                } else {
                    this.loadTrainings();
                }
            })
            .catch(() => {
                // W razie błędu sprawdzania profilu, nie blokujemy strony - pokazujemy zwykły katalog.
                this.loadTrainings();
            });
    }

    loadTrainings() {
        getTrainings({ searchTerm: this.searchTerm, format: this.filterFormat })
            .then(result => {
                this.rawTrainings = result.trainings;
                this.enrollmentStatus = result.enrollmentStatusByTraining || {};
                this.enrollmentIds = result.enrollmentIdByTraining || {};
            })
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

    handleOpenDetails(event) {
        const id = event.currentTarget.dataset.id;
        const t = this.rawTrainings.find(x => x.Id === id);
        if (!t) return;
        const status = this.enrollmentStatus[id];
        this.detailsTraining = {
            id: t.Id,
            name: t.Name,
            format: t.Format__c,
            location: t.Location__c,
            price: t.Price__c,
            description: t.Description__c,
            startDate: t.Start_Date__c,
            endDate: t.End_Date__c,
            trainerName: t.Trainer__r ? t.Trainer__r.Name : null,
            trainerSpecialization: t.Trainer__r ? t.Trainer__r.Specialization__c : null,
            trainerBio: t.Trainer__r ? t.Trainer__r.Bio__c : null,
            enrollmentId: this.enrollmentIds[id],
            showUnenroll: status === 'Enrolled' || status === 'Waitlisted' || status === 'Pending Approval'
        };
        this.confirmUnenroll = false;
        this.isUnenrolling = false;
        this.unenrollError = '';
        this.showDetails = true;
    }

    handleCloseDetails() {
        this.showDetails = false;
    }

    handleDetailsOverlayClick(event) {
        if (event.target === event.currentTarget) {
            this.handleCloseDetails();
        }
    }

    handleEnroll(event) {
        const trainingId = event.target.dataset.id;
        const training = this.rawTrainings.find(t => t.Id === trainingId);
        this.selectedTrainingId = trainingId;
        this.selectedTrainingName = training ? training.Name : '';
        this.selectedTrainingPrereq = training ? training.Prerequisite_Info__c : '';
        this.showEnrollForm = true;
    }

    handleUnenroll() {
        // dwustopniowe potwierdzenie — ponowny zapis jest zablokowany
        if (!this.confirmUnenroll) {
            this.confirmUnenroll = true;
            this.unenrollError = '';
            return;
        }
        this.isUnenrolling = true;
        cancelEnrollment({ enrollmentId: this.detailsTraining.enrollmentId })
            .then(() => {
                this.isUnenrolling = false;
                this.showDetails = false;
                this.loadTrainings();
            })
            .catch(error => {
                this.isUnenrolling = false;
                this.confirmUnenroll = false;
                this.unenrollError = error.body ? error.body.message : 'Unenroll failed.';
            });
    }

    handleCloseModal() {
        this.showEnrollForm = false;
        this.loadTrainings();
    }
}