import { LightningElement, track, wire } from 'lwc';
import getEnrollmentsPerMonth from '@salesforce/apex/CoordinatorDashboardController.getEnrollmentsPerMonth';
import getTrainingFormats from '@salesforce/apex/CoordinatorDashboardController.getTrainingFormats';

export default class StatsChart extends LightningElement {
    @track barData = [];
    @track pieData = [];
    donutStyle = '';

    // POBIERANIE ŻYWYCH DANYCH: WYKRES SŁUPKOWY
    @wire(getEnrollmentsPerMonth)
    wiredEnrollments({ error, data }) {
        if (data && data.length > 0) {
            const maxValue = Math.max(...data.map(d => d.value));
            
            this.barData = data.map(item => ({
                ...item,
                // Zabezpieczenie przed dzieleniem przez 0
                styleHeight: `height: ${maxValue > 0 ? (item.value / maxValue) * 100 : 0}%`
            }));
        } else if (error) {
            console.error('Błąd pobierania danych słupkowych:', error);
        }
    }

    // POBIERANIE ŻYWYCH DANYCH: WYKRES KOŁOWY
    @wire(getTrainingFormats)
    wiredFormats({ error, data }) {
        if (data && data.length > 0) {
            const totalPie = data.reduce((sum, item) => sum + item.value, 0);
            
            let currentPercent = 0;
            let gradients = [];

            this.pieData = data.map(item => {
                const percent = totalPie > 0 ? Math.round((item.value / totalPie) * 100) : 0;
                const start = currentPercent;
                currentPercent += percent;
                
                gradients.push(`${item.color} ${start}% ${currentPercent}%`);
                
                return {
                    label: item.label,
                    percent: percent,
                    colorStyle: `background-color: ${item.color}`
                };
            });

            this.donutStyle = `background: conic-gradient(${gradients.join(', ')});`;
        } else if (error) {
            console.error('Błąd pobierania danych kołowych:', error);
        }
    }
}