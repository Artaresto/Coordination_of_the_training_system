import { LightningElement, track, wire } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getOverviewStats from '@salesforce/apex/AdminDashboardController.getOverviewStats';
import getAllTrainings from '@salesforce/apex/AdminDashboardController.getAllTrainings';
import getRooms from '@salesforce/apex/AdminDashboardController.getRooms';
import deleteRoom from '@salesforce/apex/AdminDashboardController.deleteRoom';
import getTrainers from '@salesforce/apex/AdminDashboardController.getTrainers';
import deleteTrainer from '@salesforce/apex/AdminDashboardController.deleteTrainer';
import getEnrollmentsPerMonth from '@salesforce/apex/AdminDashboardController.getEnrollmentsPerMonth';
import getTrainingFormats from '@salesforce/apex/AdminDashboardController.getTrainingFormats';
import getTopCoordinators from '@salesforce/apex/AdminDashboardController.getTopCoordinators';
import getSystemUsers from '@salesforce/apex/AdminSystemController.getSystemUsers';
import getRecentLogins from '@salesforce/apex/AdminSystemController.getRecentLogins';
import getObjectRecordCounts from '@salesforce/apex/AdminSystemController.getObjectRecordCounts';
import getFailedApexJobs from '@salesforce/apex/AdminSystemController.getFailedApexJobs';
import getRevenuePerMonth from '@salesforce/apex/AdminSystemController.getRevenuePerMonth';

const STATUS_LABELS = {
    Planed: 'Planowane',
    Active: 'Aktywne',
    Ended: 'Zakończone'
};

export default class AdminDashboard extends NavigationMixin(LightningElement) {

    // --- Przegląd ---
    @track stats = {
        totalTrainings: 0,
        activeTrainings: 0,
        plannedTrainings: 0,
        endedTrainings: 0,
        totalEnrollments: 0,
        certificatesThisMonth: 0,
        totalRooms: 0,
        totalTrainers: 0,
        totalCoordinators: 0
    };
    @track topCoordinators = [];

    // --- Wszystkie szkolenia ---
    @track allTrainings = [];
    @track trainingsSearchTerm = '';

    trainingColumns = [
        { label: 'Nazwa', fieldName: 'trainingName', type: 'text', wrapText: true },
        { label: 'Koordynator', fieldName: 'ownerName', type: 'text' },
        { label: 'Status', fieldName: 'statusLabel', type: 'text', initialWidth: 110 },
        { label: 'Format', fieldName: 'format', type: 'text', initialWidth: 100 },
        { label: 'Start', fieldName: 'startDate', type: 'date',
            typeAttributes: { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' } },
        { label: 'Koniec', fieldName: 'endDate', type: 'date',
            typeAttributes: { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' } },
        { label: 'Lokalizacja', fieldName: 'location', type: 'text' },
        { label: 'Sala', fieldName: 'roomName', type: 'text' },
        { label: 'Terminy', fieldName: 'sessionsCount', type: 'number', initialWidth: 90 },
        { label: 'Zapisani', fieldName: 'occupancy', type: 'text', initialWidth: 100 }
    ];

    // --- Sale ---
    @track rooms = [];
    @track isRoomModalOpen = false;
    roomColumns = [
        { label: 'Nazwa', fieldName: 'roomName', type: 'text' },
        { label: 'Lokalizacja', fieldName: 'location', type: 'text' },
        { label: 'Pojemność', fieldName: 'maxCapacity', type: 'number' },
        { label: 'Komputery', fieldName: 'hasComputers', type: 'boolean' },
        { label: 'W użyciu (szkoleń)', fieldName: 'usageCount', type: 'number', initialWidth: 150 },
        { type: 'action', typeAttributes: { rowActions: [{ label: 'Usuń', name: 'delete_room' }] } }
    ];

    // --- Trenerzy ---
    @track trainers = [];
    @track isTrainerModalOpen = false;
    trainerColumns = [
        { label: 'Nazwa', fieldName: 'trainerName', type: 'text' },
        { label: 'Specjalizacja', fieldName: 'specialization', type: 'text' },
        { label: 'E-mail', fieldName: 'email', type: 'email' },
        { label: 'Telefon', fieldName: 'phone', type: 'phone' },
        { label: 'Dostępny', fieldName: 'isAvailable', type: 'boolean' },
        { label: 'W użyciu (szkoleń)', fieldName: 'usageCount', type: 'number', initialWidth: 150 },
        { type: 'action', typeAttributes: { rowActions: [{ label: 'Usuń', name: 'delete_trainer' }] } }
    ];

    // --- Analiza ---
    @track monthlyData = [];
    @track formatLegend = [];
    pieChartStyle = 'width: 160px; height: 160px; border-radius: 50%; background: #e5e7eb;';

    // --- System: uzytkownicy ---
    @track systemUsers = [];
    userColumns = [
        { label: 'Nazwa', fieldName: 'fullName', type: 'text' },
        { label: 'Username', fieldName: 'username', type: 'text' },
        { label: 'Profil', fieldName: 'profileName', type: 'text' },
        { label: 'Rola', fieldName: 'roleName', type: 'text' },
        { label: 'Aktywny', fieldName: 'isActive', type: 'boolean' },
        { label: 'Ostatnie logowanie', fieldName: 'lastLogin', type: 'date',
            typeAttributes: { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' } }
    ];

    // --- System: logowania ---
    @track recentLogins = [];
    loginColumns = [
        { label: 'Użytkownik', fieldName: 'userName', type: 'text' },
        { label: 'Data logowania', fieldName: 'loginTime', type: 'date',
            typeAttributes: { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' } },
        { label: 'Status', fieldName: 'status', type: 'text' },
        { label: 'Aplikacja', fieldName: 'application', type: 'text' },
        { label: 'Przeglądarka', fieldName: 'browser', type: 'text' }
    ];

    // --- System: liczba rekordow ---
    @track recordCounts = {};

    // --- System: integracje ---

    // --- System: bledy Apex ---
    @track failedJobs = [];
    failedJobColumns = [
        { label: 'Typ zadania', fieldName: 'jobType', type: 'text' },
        { label: 'Klasa Apex', fieldName: 'apexClassName', type: 'text' },
        { label: 'Status', fieldName: 'status', type: 'text' },
        { label: 'Zakończono', fieldName: 'completedDate', type: 'date',
            typeAttributes: { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' } },
        { label: 'Komunikat błędu', fieldName: 'errorMessage', type: 'text', wrapText: true }
    ];

    // --- System: przychod ---
    @track revenueData = [];

    wiredTrainingsResult;
    wiredRoomsResult;
    wiredTrainersResult;

    connectedCallback() {
        this.loadOverview();
        this.loadSystemTab();
    }

    loadSystemTab() {
        getSystemUsers().then(data => { this.systemUsers = data; }).catch(error => this.showError(error));
        getRecentLogins().then(data => { this.recentLogins = data; }).catch(error => this.showError(error));
        getObjectRecordCounts().then(data => { this.recordCounts = data; }).catch(error => this.showError(error));
        getFailedApexJobs().then(data => { this.failedJobs = data; }).catch(error => this.showError(error));
        getRevenuePerMonth()
            .then(data => {
                const maxVal = Math.max(...data.map(d => d.value), 1);
                this.revenueData = data.map(d => ({
                    month: d.month,
                    value: d.value,
                    displayValue: d.value > 0 ? `${d.value.toFixed(0)} PLN` : '',
                    barStyle: `height: ${(d.value / maxVal) * 100}%; background-color: #059669; border-radius: 4px 4px 0 0; width: 60%; margin: 0 auto; transition: height 0.5s ease;`
                }));
            })
            .catch(error => this.showError(error));
    }

    get hasFailedJobs() {
        return this.failedJobs && this.failedJobs.length > 0;
    }

    // --- Eksport CSV (po stronie klienta, dziala dla kazdej z tabel admina) ---

    exportToCsv(rows, columns, fileName) {
        if (!rows || rows.length === 0) {
            this.showToast('Brak danych', 'Nie ma nic do wyeksportowania.', 'warning');
            return;
        }
        try {
            const headers = columns.map(c => c.label);
            const fields = columns.map(c => c.fieldName);

            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '';
                const str = String(val);
                return str.includes(',') || str.includes('"') || str.includes('\n')
                    ? `"${str.replace(/"/g, '""')}"`
                    : str;
            };

            const lines = [headers.join(',')];
            rows.forEach(row => {
                lines.push(fields.map(f => escapeCsv(row[f])).join(','));
            });

            // BOM (\uFEFF) zapewnia poprawne wyświetlanie polskich znaków po otwarciu w Excelu
            const csvContent = '\uFEFF' + lines.join('\n');
            // Lightning Web Security ma zamkniętą listę dozwolonych typów MIME dla Blob()
            // i 'text/csv' nie jest na niej (niezależnie od dokładnego zapisu stringa) -
            // dlatego nie podajemy w ogóle typu. Rozszerzenie .csv w atrybucie "download"
            // wystarczy, żeby system/przeglądarka poprawnie rozpoznały plik.
            const blob = new Blob([csvContent]);
            const url = URL.createObjectURL(blob);

            const link = this.template.querySelector('a[data-id="csvDownloadLink"]');
            if (!link) {
                throw new Error('Nie znaleziono elementu linku do pobrania w szablonie.');
            }

            link.href = url;
            link.download = fileName;
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);

            this.showToast('Sukces', `Plik ${fileName} powinien się pobrać.`, 'success');
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error('Błąd eksportu CSV:', err);
            this.showToast('Błąd eksportu CSV', err.message || String(err), 'error');
        }
    }

    handleExportTrainingsCsv() {
        this.exportToCsv(this.filteredTrainings, this.trainingColumns, 'szkolenia.csv');
    }

    handleExportUsersCsv() {
        this.exportToCsv(this.systemUsers, this.userColumns, 'uzytkownicy.csv');
    }

    loadOverview() {
        getOverviewStats()
            .then(data => { this.stats = data; })
            .catch(error => this.showError(error));

        getTopCoordinators()
            .then(data => {
                const max = Math.max(...data.map(d => d.count), 1);
                this.topCoordinators = data.map(d => ({
                    ...d,
                    barStyle: `width: ${Math.round((d.count / max) * 100)}%;`
                }));
            })
            .catch(error => this.showError(error));
    }

    @wire(getAllTrainings)
    wiredTrainings(result) {
        this.wiredTrainingsResult = result;
        if (result.data) {
            this.allTrainings = result.data.map(t => ({
                ...t,
                statusLabel: STATUS_LABELS[t.status] || t.status,
                occupancy: `${t.enrolledCount || 0} / ${t.maxParticipants || 0}`
            }));
        } else if (result.error) {
            this.showError(result.error);
        }
    }

    get filteredTrainings() {
        const term = (this.trainingsSearchTerm || '').toLowerCase().trim();
        if (!term) return this.allTrainings;
        return this.allTrainings.filter(t =>
            (t.trainingName || '').toLowerCase().includes(term) ||
            (t.ownerName || '').toLowerCase().includes(term) ||
            (t.location || '').toLowerCase().includes(term)
        );
    }

    handleTrainingsSearch(event) {
        this.trainingsSearchTerm = event.target.value;
    }

    @wire(getRooms)
    wiredRooms(result) {
        this.wiredRoomsResult = result;
        if (result.data) this.rooms = result.data;
        else if (result.error) this.showError(result.error);
    }

    @wire(getTrainers)
    wiredTrainers(result) {
        this.wiredTrainersResult = result;
        if (result.data) this.trainers = result.data;
        else if (result.error) this.showError(result.error);
    }

    @wire(getEnrollmentsPerMonth)
    wiredMonthly({ data }) {
        if (data && data.length > 0) {
            let maxVal = Math.max(...data.map(d => d.value), 1);
            this.monthlyData = data.map(d => ({
                month: d.month,
                value: d.value,
                displayValue: d.value > 0 ? d.value : '',
                barStyle: `height: ${(d.value / maxVal) * 100}%; background-color: #043669; border-radius: 4px 4px 0 0; width: 60%; margin: 0 auto; transition: height 0.5s ease;`
            }));
        }
    }

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
            this.pieChartStyle = `width: 160px; height: 160px; border-radius: 50%; background: conic-gradient(${gradientParts.join(', ')});`;
        }
    }

    // --- Akcje: Sale ---

    openRoomModal() { this.isRoomModalOpen = true; }
    closeRoomModal() { this.isRoomModalOpen = false; }

    handleRoomSuccess() {
        this.showToast('Sukces', 'Sala została dodana.', 'success');
        this.closeRoomModal();
        refreshApex(this.wiredRoomsResult);
        this.loadOverview();
    }

    handleRoomRowAction(event) {
        if (event.detail.action.name === 'delete_room') {
            const row = event.detail.row;
            let msg = `Czy na pewno chcesz usunąć salę "${row.roomName}"?`;
            if (row.usageCount > 0) {
                msg += `\n\nUWAGA: ta sala jest przypisana do ${row.usageCount} niezakończonych szkoleń. Po usunięciu zostanie z nich odpięta (szkolenia zostaną bez sali).`;
            }
            if (confirm(msg)) {
                deleteRoom({ roomId: row.recordId })
                    .then(() => {
                        this.showToast('Sukces', 'Sala usunięta.', 'success');
                        refreshApex(this.wiredRoomsResult);
                        this.loadOverview();
                    })
                    .catch(error => this.showError(error));
            }
        }
    }

    // --- Akcje: Trenerzy ---

    openTrainerModal() { this.isTrainerModalOpen = true; }
    closeTrainerModal() { this.isTrainerModalOpen = false; }

    handleTrainerSuccess() {
        this.showToast('Sukces', 'Trener został dodany.', 'success');
        this.closeTrainerModal();
        refreshApex(this.wiredTrainersResult);
        this.loadOverview();
    }

    handleTrainerRowAction(event) {
        if (event.detail.action.name === 'delete_trainer') {
            const row = event.detail.row;
            let msg = `Czy na pewno chcesz usunąć trenera "${row.trainerName}"?`;
            if (row.usageCount > 0) {
                msg += `\n\nUWAGA: ten trener jest przypisany do ${row.usageCount} niezakończonych szkoleń. Po usunięciu zostanie z nich odpięty.`;
            }
            if (confirm(msg)) {
                deleteTrainer({ trainerId: row.recordId })
                    .then(() => {
                        this.showToast('Sukces', 'Trener usunięty.', 'success');
                        refreshApex(this.wiredTrainersResult);
                        this.loadOverview();
                    })
                    .catch(error => this.showError(error));
            }
        }
    }

    stopPropagation(event) {
        event.stopPropagation();
    }
    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    showError(error) {
        this.showToast('Błąd', error && error.body ? error.body.message : 'Wystąpił nieoczekiwany błąd.', 'error');
    }
}
