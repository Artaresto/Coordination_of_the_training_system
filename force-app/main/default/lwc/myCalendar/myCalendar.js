import { LightningElement, track } from 'lwc';
import { NavigationMixin } from 'lightning/navigation';
import basePath from '@salesforce/community/basePath';
import getMyEnrollments from '@salesforce/apex/MyTrainingsController.getMyEnrollments';
import cancelEnrollment from '@salesforce/apex/MyTrainingsController.cancelEnrollment';
import submitReview from '@salesforce/apex/MyTrainingsController.submitReview';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

export default class MyCalendar extends NavigationMixin(LightningElement) {

    @track items = [];
    @track byDay = {};

    @track viewYear = new Date().getFullYear();
    @track viewMonth = new Date().getMonth();

    @track showDetails = false;
    @track selected = {};
    @track cancelError = '';
    @track isCancelling = false;

    @track reviewTrainingRating = 0;
    @track reviewTrainerRating = 0;
    @track reviewComment = '';
    @track isSubmittingReview = false;
    @track reviewError = '';
    @track reviewSaved = false;

    weekdays = WEEKDAYS;

    connectedCallback() {
        this.loadData();
    }

    loadData() {
        getMyEnrollments()
            .then(result => {
                this.items = result.map(e => ({
                    enrollmentId: e.Id,
                    status: e.Status__c,
                    name: e.Training__r.Name,
                    startDate: e.Training__r.Start_Date__c,
                    endDate: e.Training__r.End_Date__c,
                    format: e.Training__r.Format__c,
                    location: e.Training__r.Location__c,
                    description: e.Training__r.Description__c,
                    isCompleted: e.Status__c === 'Completed',
                    trainingRating: e.Training_Rating__c || 0,
                    trainerRating: e.Trainer_Rating__c || 0,
                    comment: e.Review_Comment__c || '',
                    trainerName: e.Training__r.Trainer__r ? e.Training__r.Trainer__r.Name : null,
                    trainerSpecialization: e.Training__r.Trainer__r ? e.Training__r.Trainer__r.Specialization__c : null,
                    trainerBio: e.Training__r.Trainer__r ? e.Training__r.Trainer__r.Bio__c : null,
                    canCancel: e.Status__c !== 'Cancelled'
                        && new Date(e.Training__r.Start_Date__c) > new Date(),
                    chipClass: e.Status__c === 'Cancelled'
                        ? 'cal-chip cal-chip--cancelled'
                        : e.Status__c === 'Pending Approval'
                            ? 'cal-chip cal-chip--pending'
                            : e.Status__c === 'Waitlisted'
                                ? 'cal-chip cal-chip--waitlisted'
                                : e.Status__c === 'Completed'
                                    ? 'cal-chip cal-chip--completed'
                                    : 'cal-chip'
                }));

                // rozkładamy każde szkolenie na wszystkie dni od startu do końca
                const map = {};
                this.items.forEach(it => {
                    const start = new Date(it.startDate);
                    const end = it.endDate ? new Date(it.endDate) : start;
                    this.eachDateKey(start, end).forEach(key => {
                        (map[key] = map[key] || []).push(it);
                    });
                });
                this.byDay = map;
            })
            .catch(error => { console.error(error); });
    }

    // zwraca klucze dni od start do end włącznie (np. szkolenie 3-dniowe = 3 klucze)
    eachDateKey(start, end) {
        const keys = [];
        const cur = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const last = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        if (last < cur) {
            return [this.toDateKey(cur)];
        }
        while (cur <= last) {
            keys.push(this.toDateKey(cur));
            cur.setDate(cur.getDate() + 1);
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
        const id = event.currentTarget.dataset.eid;
        this.selected = this.items.find(it => it.enrollmentId === id) || {};
        this.cancelError = '';
        this.reviewError = '';
        this.reviewSaved = false;
        this.reviewTrainingRating = this.selected.trainingRating || 0;
        this.reviewTrainerRating = this.selected.trainerRating || 0;
        this.reviewComment = this.selected.comment || '';
        this.showDetails = true;
    }

    get trainingStars() { return this.buildStars(this.reviewTrainingRating); }
    get trainerStars() { return this.buildStars(this.reviewTrainerRating); }

    buildStars(value) {
        return [1, 2, 3, 4, 5].map(n => ({
            value: n,
            key: 'star-' + n,
            class: n <= value ? 'cal-star cal-star--on' : 'cal-star'
        }));
    }

    handleStarClick(event) {
        const type = event.currentTarget.dataset.rating;
        const value = parseInt(event.currentTarget.dataset.value, 10);
        if (type === 'training') this.reviewTrainingRating = value;
        else this.reviewTrainerRating = value;
    }

    handleReviewComment(event) {
        this.reviewComment = event.target.value;
    }

    handleSubmitReview() {
        if (!this.reviewTrainingRating || !this.reviewTrainerRating) {
            this.reviewError = 'Please rate both the training and the trainer.';
            return;
        }
        this.isSubmittingReview = true;
        this.reviewError = '';
        submitReview({
            enrollmentId: this.selected.enrollmentId,
            trainingRating: this.reviewTrainingRating,
            trainerRating: this.reviewTrainerRating,
            comment: this.reviewComment
        })
            .then(() => {
                this.isSubmittingReview = false;
                this.reviewSaved = true;
                this.loadData();
            })
            .catch(error => {
                this.isSubmittingReview = false;
                this.reviewError = error.body ? error.body.message : 'Could not save your review.';
            });
    }

    handleCloseDetails() {
        this.showDetails = false;
    }

    handleOverlayClick(event) {
        if (event.target === event.currentTarget) this.handleCloseDetails();
    }

    handleCancel() {
        this.isCancelling = true;
        this.cancelError = '';
        cancelEnrollment({ enrollmentId: this.selected.enrollmentId })
            .then(() => {
                this.isCancelling = false;
                this.showDetails = false;
                this.loadData();
            })
            .catch(error => {
                this.isCancelling = false;
                this.cancelError = error.body ? error.body.message : 'Cancellation failed.';
            });
    }

    handleGoToCatalog() {
        this[NavigationMixin.Navigate]({
            type: 'standard__webPage',
            attributes: { url: basePath }
        });
    }
}