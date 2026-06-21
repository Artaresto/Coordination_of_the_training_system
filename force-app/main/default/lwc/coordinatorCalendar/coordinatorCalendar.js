import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import getMyTrainings from '@salesforce/apex/CoordinatorDashboardController.getMyTrainings';

const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Nie'];
const MONTHS = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec',
    'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

export default class CoordinatorCalendar extends NavigationMixin(LightningElement) {

    @track items = [];
    @track byDay = {};

    @track viewYear = new Date().getFullYear();
    @track viewMonth = new Date().getMonth();

    @track showDetails = false;
    @track selected = {};

    weekdays = WEEKDAYS;

    connectedCallback() {
        this.loadData();
    }

    loadData() {
        getMyTrainings()
            .then(result => {
                this.items = result.map(t => ({
                    id: t.Id,
                    name: t.Name,
                    status: t.Status__c,
                    startDate: t.Start_Date__c,
                    endDate: t.End_Date__c,
                    format: t.Format__c,
                    maxParticipants: t.Max_Participants__c,
                    enrolledCount: t.Enrolled_Count__c,
                    sessions: t.Training_Sessions__r || [],
                    chipClass: t.Status__c === 'Ended'
                        ? 'cal-chip cal-chip--completed'
                        : t.Status__c === 'Planed'
                            ? 'cal-chip cal-chip--pending'
                            : 'cal-chip'
                }));

                const map = {};
                this.items.forEach(it => {
                    // Jeśli kurs ma zdefiniowane terminy (Training_Session__c) - pokazujemy chip
                    // tylko w te konkretne dni. Dla starszych rekordów bez sesji - fallback na
                    // cały zakres Start_Date__c-End_Date__c (jak dawniej).
                    if (it.sessions.length > 0) {
                        it.sessions.forEach(s => {
                            if (!s.Start_Time__c) return;
                            const dateKey = this.toDateKey(new Date(s.Start_Time__c));
                            (map[dateKey] = map[dateKey] || []).push(it);
                        });
                    } else {
                        this.getDateKeysInRange(it.startDate, it.endDate).forEach(dateKey => {
                            (map[dateKey] = map[dateKey] || []).push(it);
                        });
                    }
                });
                this.byDay = map;
            })
            .catch(error => { console.error(error); });
    }

    // Zwraca listę kluczy dat (YYYY-MM-DD) dla każdego dnia pomiędzy start i end (włącznie),
    // dzięki czemu szkolenie trwające kilka dni pojawia się w kalendarzu na każdym z nich.
    getDateKeysInRange(start, end) {
        const keys = [];
        if (!start) return keys;

        const startDay = new Date(start);
        startDay.setHours(0, 0, 0, 0);

        const endDay = end ? new Date(end) : new Date(start);
        endDay.setHours(0, 0, 0, 0);

        // Zabezpieczenie przed nieskończoną pętlą / błędnymi danymi
        const maxDays = 366;
        let current = new Date(startDay);
        let count = 0;

        while (current <= endDay && count < maxDays) {
            keys.push(this.toDateKey(current));
            current.setDate(current.getDate() + 1);
            count++;
        }

        return keys;
    }

    toDateKey(d) {
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${d.getFullYear()}-${m}-${day}`;
    }

    get monthLabel() {
        return `${MONTHS[this.viewMonth]} ${this.viewYear}`;
    }

    get hasNoTrainings() {
        return this.items.length === 0;
    }

    get weeks() {
        const year = this.viewYear;
        const month = this.viewMonth;
        const firstDay = new Date(year, month, 1);
        const offset = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const todayKey = this.toDateKey(new Date());

        const cells = [];
        for (let i = 0; i < offset; i++) {
            cells.push({ key: `pad-start-${i}`, empty: true });
        }
        for (let d = 1; d <= daysInMonth; d++) {
            const dateKey = this.toDateKey(new Date(year, month, d));
            cells.push({
                key: dateKey,
                empty: false,
                day: d,
                trainings: this.byDay[dateKey] || [],
                cellClass: dateKey === todayKey ? 'cal-cell cal-cell--today' : 'cal-cell'
            });
        }
        while (cells.length % 7 !== 0) {
            cells.push({ key: `pad-end-${cells.length}`, empty: true });
        }

        const weeks = [];
        for (let i = 0; i < cells.length; i += 7) {
            weeks.push({ key: `week-${i}`, days: cells.slice(i, i + 7) });
        }
        return weeks;
    }

    handlePrev() {
        if (this.viewMonth === 0) { this.viewMonth = 11; this.viewYear -= 1; }
        else { this.viewMonth -= 1; }
    }

    handleNext() {
        if (this.viewMonth === 11) { this.viewMonth = 0; this.viewYear += 1; }
        else { this.viewMonth += 1; }
    }

    handleToday() {
        const now = new Date();
        this.viewYear = now.getFullYear();
        this.viewMonth = now.getMonth();
    }

    handleSelect(event) {
        const id = event.currentTarget.dataset.tid;
        this.selected = this.items.find(it => it.id === id) || {};
        this.showDetails = true;
    }

    handleCloseDetails() {
        this.showDetails = false;
    }

    handleOverlayClick(event) {
        if (event.target === event.currentTarget) this.handleCloseDetails();
    }

    handleGoToTraining() {
        this[NavigationMixin.Navigate]({
            type: 'standard__recordPage',
            attributes: {
                recordId: this.selected.id,
                objectApiName: 'Training__c',
                actionName: 'view'
            }
        });
    }
}
