import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getDistinctLocations from '@salesforce/apex/TrainingFormController.getDistinctLocations';
import getRoomsByLocation from '@salesforce/apex/TrainingFormController.getRoomsByLocation';
import createTrainingWithSessions from '@salesforce/apex/TrainingFormController.createTrainingWithSessions';

const RECURRENCE_UNIT_OPTIONS = [
    { label: 'dni', value: 'day' },
    { label: 'tygodnie', value: 'week' },
    { label: 'miesiące', value: 'month' }
];


const MAX_OCCURRENCES = 52;
const DEFAULT_DURATION_MINUTES = 120;

function pad(n) {
    return String(n).padStart(2, '0');
}

function defaultDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultTimeStr() {
    return '09:00';
}

function normalizeTime(value) {
    // lightning-input type="time" zwraca HH:mm:ss.SSS — bierzemy tylko HH:mm
    return value ? value.slice(0, 5) : value;
}

export default class TrainingForm extends LightningElement {

    @track selectedLocation = '';
    @track selectedRoomId = '';
    @track rooms = [];
    @track requiresCertificate = false;
    @track prerequisiteInfo = '';
    @track isSaving = false;
    @track selectedFormat = '';
    @track requiresComputers = false;

    // Start - data i godzina jako osobne pola, żeby móc liczyć koniec/czas trwania na żywo
    @track startDateStr = defaultDateStr();
    @track startTimeStr = defaultTimeStr();

    // Czas trwania i godzina zakończenia - edytowalne w obie strony, zawsze zsynchronizowane
    @track durationMinutes = DEFAULT_DURATION_MINUTES;
    @track endTimeStr = '';

    // Cykliczność - to JEDNO szkolenie (Training__c) z wieloma terminami (Training_Session__c),
    // a nie kilka osobnych szkoleń.
    @track isRecurring = false;
    @track recurrenceUnit = 'week';
    @track recurrenceInterval = 1;
    @track recurrenceCount = 4;

    formatOptions = [
        { label: 'Stationary', value: 'Stationary' },
        { label: 'Online', value: 'Online' },
        { label: 'Hybrid', value: 'Hybrid' }
    ];

    emptyOptions = [];
    locationOptions = [];
    recurrenceUnitOptions = RECURRENCE_UNIT_OPTIONS;

    connectedCallback() {
        this.recalculateEndTimeFromDuration();
    }

    @wire(getDistinctLocations)
    wiredLocations({ data, error }) {
        if (data) {
            this.locationOptions = data.map(loc => ({ label: loc, value: loc }));
        } else if (error) {
            console.error('Błąd pobierania lokalizacji:', error);
        }
    }

    @wire(getRoomsByLocation, { location: '$selectedLocation', requiresComputers: '$requiresComputers' })
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

    get saveButtonLabel() {
        return this.isSaving ? 'Zapisywanie…' : 'Zapisz szkolenie';
    }

    get recurrenceSummary() {
        if (!this.isRecurring) return '';
        const unitLabel = this.recurrenceUnitOptions.find(o => o.value === this.recurrenceUnit)?.label || '';
        const count = this.recurrenceCount || 0;
        const interval = this.recurrenceInterval || 1;
        return `To JEDNO szkolenie z ${count} terminami, co ${interval} ${unitLabel}, w tych samych godzinach (każdy trwa ${this.durationLabel}). Jeden komplet zapisów i jeden certyfikat na koniec całego kursu.`;
    }

    get durationLabel() {
        const minutes = this.durationMinutes || 0;
        if (minutes < 60) return `${minutes} min`;
        const h = Math.floor(minutes / 60);
        const m = minutes % 60;
        return m === 0 ? `${h} godz.` : `${h} godz. ${m} min`;
    }

    // --- Logika start / czas trwania / godzina zakończenia (dwukierunkowa synchronizacja) ---

    getStartDate() {
        if (!this.startDateStr || !this.startTimeStr) return null;
        return new Date(`${this.startDateStr}T${this.startTimeStr}:00`);
    }

    recalculateEndTimeFromDuration() {
        const start = this.getStartDate();
        if (!start || !this.durationMinutes) return;
        const end = new Date(start.getTime() + this.durationMinutes * 60000);
        this.endTimeStr = `${pad(end.getHours())}:${pad(end.getMinutes())}`;
    }

    recalculateDurationFromEndTime() {
        const start = this.getStartDate();
        if (!start || !this.endTimeStr) return;

        let end = new Date(`${this.startDateStr}T${this.endTimeStr}:00`);
        if (end <= start) {
            end = new Date(end.getTime() + 24 * 60 * 60000);
        }

        this.durationMinutes = Math.round((end.getTime() - start.getTime()) / 60000);
    }

    handleStartDateChange(event) {
        this.startDateStr = event.detail.value;
        this.recalculateEndTimeFromDuration();
    }

    handleStartTimeChange(event) {
        this.startTimeStr = normalizeTime(event.detail.value);
        this.recalculateEndTimeFromDuration();
    }

    handleDurationChange(event) {
        this.durationMinutes = parseInt(event.detail.value, 10) || 0;
        this.recalculateEndTimeFromDuration();
    }

    handleEndTimeChange(event) {
        this.endTimeStr = normalizeTime(event.detail.value);
        this.recalculateDurationFromEndTime();
    }

    // --- Reszta formularza ---

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

    get showRoomSection() {
        return this.selectedFormat === 'Stationary' || this.selectedFormat === 'Hybrid';
    }

    handleFormatChange(event) {
        this.selectedFormat = event.detail.value;
        this.selectedLocation = '';
        this.selectedRoomId = '';
        this.rooms = [];
    }

    handleComputersToggle(event) {
        this.requiresComputers = event.target.checked;
        this.selectedRoomId = '';
        this.rooms = [];
    }

    handleRoomChange(event) {
        this.selectedRoomId = event.detail.value;
    }

    handleRecurringToggle(event) {
        this.isRecurring = event.target.checked;
    }

    handleRecurrenceUnitChange(event) {
        this.recurrenceUnit = event.detail.value;
    }

    handleRecurrenceIntervalChange(event) {
        this.recurrenceInterval = parseInt(event.detail.value, 10) || 1;
    }

    handleRecurrenceCountChange(event) {
        this.recurrenceCount = parseInt(event.detail.value, 10) || 1;
    }

    handleSubmit(event) {
        event.preventDefault();
        const fields = { ...event.detail.fields };

        const startDate = this.getStartDate();
        if (!startDate) {
            this.showError('Podaj poprawną datę i godzinę rozpoczęcia.');
            return;
        }

        if (startDate < new Date()) {
            this.showError('Data rozpoczęcia nie może być w przeszłości.');
            return;
        }

        if (!this.durationMinutes || this.durationMinutes < 1) {
            this.showError('Podaj prawidłowy czas trwania zajęć (min. 1 minuta) lub godzinę zakończenia.');
            return;
        }

        if (this.showRoomSection && !this.selectedLocation) {
            this.showError('Wybierz lokalizację dla szkolenia stacjonarnego/hybrydowego.');
            return;
        }

        if (this.requiresCertificate && !this.prerequisiteInfo.trim()) {
            this.showError('Podaj opis wymaganego certyfikatu.');
            return;
        }

        if (this.isRecurring) {
            if (!this.recurrenceInterval || this.recurrenceInterval < 1) {
                this.showError('Podaj prawidłowy odstęp między terminami (min. 1).');
                return;
            }
            if (!this.recurrenceCount || this.recurrenceCount < 2 || this.recurrenceCount > MAX_OCCURRENCES) {
                this.showError(`Liczba powtórzeń musi być w zakresie 2–${MAX_OCCURRENCES}.`);
                return;
            }
        }

        fields.Location__c = this.selectedLocation;
        if (this.selectedRoomId) {
            fields.Room__c = this.selectedRoomId;
        }
        fields.Prerequisite_Info__c = this.requiresCertificate ? this.prerequisiteInfo : '';

        const occurrences = this.isRecurring ? this.recurrenceCount : 1;
        const sessionStarts = this.buildSessionStarts(startDate, occurrences);

        // Training__c.Start_Date__c / End_Date__c = zakres CAŁEGO kursu (pierwszy i ostatni termin)
        const lastStart = sessionStarts[sessionStarts.length - 1];
        const lastEnd = new Date(lastStart.getTime() + this.durationMinutes * 60000);

        fields.Start_Date__c = startDate.toISOString();
        fields.End_Date__c = lastEnd.toISOString();
        fields.Format__c = this.selectedFormat;

        const sessions = sessionStarts.map(s => ({
            Start_Time__c: s.toISOString(),
            Duration_Minutes__c: this.durationMinutes
        }));

        this.isSaving = true;
        createTrainingWithSessions({ training: fields, sessions })
            .then(id => {
                this.isSaving = false;
                this.dispatchEvent(new CustomEvent('success', { detail: id }));
            })
            .catch(error => {
                this.isSaving = false;
                this.showError(error.body ? error.body.message : 'Nie udało się zapisać szkolenia.');
            });
    }

    // Lista dat startowych poszczególnych terminów (1 dla zwykłego szkolenia, N dla cyklicznego)
    buildSessionStarts(startDate, occurrences) {
        const starts = [];
        let cur = new Date(startDate);
        for (let i = 0; i < occurrences; i++) {
            starts.push(new Date(cur));
            if (this.isRecurring) {
                cur = this.shiftDate(cur, this.recurrenceUnit, this.recurrenceInterval);
            }
        }
        return starts;
    }

    shiftDate(date, unit, interval) {
        const d = new Date(date);
        if (unit === 'day') {
            d.setDate(d.getDate() + interval);
        } else if (unit === 'week') {
            d.setDate(d.getDate() + interval * 7);
        } else if (unit === 'month') {
            d.setMonth(d.getMonth() + interval);
        }
        return d;
    }

    showError(message) {
        this.dispatchEvent(new ShowToastEvent({
            title: 'Błąd walidacji',
            message,
            variant: 'error'
        }));
    }

    handleCancel() {
        this.dispatchEvent(new CustomEvent('cancel'));
    }
}