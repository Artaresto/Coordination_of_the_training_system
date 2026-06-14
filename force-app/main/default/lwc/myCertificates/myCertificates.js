import { LightningElement, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import getMyCertificates from '@salesforce/apex/CertificateController.getMyCertificates';
import JSPDF from '@salesforce/resourceUrl/jspdf';
import ROBOTO from '@salesforce/resourceUrl/jspdfRoboto';

export default class MyCertificates extends LightningElement {
    @track certificates = [];
    @track isLoading = true;
    @track errorMessage = '';
    jspdfReady = false;

    connectedCallback() {
        this.loadData();
    }

    renderedCallback() {
        if (this.jspdfReady) return;
        loadScript(this, JSPDF)
            .then(() => loadScript(this, ROBOTO))
            .then(() => { this.jspdfReady = true; })
            .catch(() => { this.errorMessage = 'Could not load PDF library.'; });
    }

    loadData() {
        this.isLoading = true;
        getMyCertificates()
            .then(result => {
                this.certificates = result.map(c => ({
                    id: c.Id,
                    number: c.Certificate_Number__c,
                    trainingName: c.Enrollment__r.Training__r.Name,
                    trainerName: c.Enrollment__r.Training__r.Trainer__r
                        ? c.Enrollment__r.Training__r.Trainer__r.Name : '',
                    participantName: c.Enrollment__r.Participant__r.Name,
                    issueDate: c.Issue_Date__c,
                    validUntil: c.Valid_Until__c
                }));
                this.isLoading = false;
            })
            .catch(error => {
                this.errorMessage = error.body ? error.body.message : 'Could not load certificates.';
                this.isLoading = false;
            });
    }

    get hasNoCertificates() {
        return !this.isLoading && this.certificates.length === 0;
    }

    handleDownload(event) {
        if (!this.jspdfReady) return;
        const c = this.certificates.find(x => x.id === event.currentTarget.dataset.id);
        if (!c) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        window.registerRoboto(doc);

        const navy = [4, 54, 105];
        const grey = [75, 85, 99];
        const cx = 148.5;

        doc.setDrawColor(...navy);
        doc.setLineWidth(2);
        doc.rect(12, 12, 273, 186);

        doc.setTextColor(...navy);
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(34);
        doc.text('CERTIFICATE', cx, 55, { align: 'center' });

        doc.setTextColor(...grey);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(13);
        doc.text('OF COMPLETION', cx, 66, { align: 'center' });
        doc.text('This certifies that', cx, 90, { align: 'center' });

        doc.setTextColor(20, 20, 20);
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(26);
        doc.text(c.participantName || '', cx, 103, { align: 'center' });

        doc.setTextColor(...grey);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(13);
        doc.text('has successfully completed the training', cx, 116, { align: 'center' });

        doc.setTextColor(...navy);
        doc.setFont('Roboto', 'bold');
        doc.setFontSize(18);
        const titleLines = doc.splitTextToSize(c.trainingName || '', 240);
        doc.text(titleLines, cx, 128, { align: 'center' });

        let y = 128 + titleLines.length * 8 + 12;

        doc.setTextColor(...grey);
        doc.setFont('Roboto', 'normal');
        doc.setFontSize(12);
        const issue = c.issueDate ? new Date(c.issueDate).toLocaleDateString() : '';
        if (c.trainerName) { doc.text('Trainer: ' + c.trainerName, cx, y, { align: 'center' }); y += 7; }
        doc.text('Issue date: ' + issue, cx, y, { align: 'center' });

        doc.setFontSize(10);
        doc.setTextColor(150, 150, 150);
        doc.text(c.number || '', cx, 188, { align: 'center' });

        doc.save((c.number || 'certificate') + '.pdf');
    }
}