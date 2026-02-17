export class DataVisualizer {
    static createChart(
        data: any[],
        chartType: 'bar' | 'line' | 'pie' | 'scatter' | 'histogram',
        xColumn?: string,
        yColumn?: string,
        title?: string
    ): { success: boolean; chart_html?: string; error?: string } {

        if (!data || data.length === 0) {
            return { success: false, error: "No data to visualize" };
        }

        const columns = Object.keys(data[0]);
        const xCol = xColumn || columns[0];
        const yCol = yColumn || columns.find(c =>
            typeof data[0][c] === 'number'
        ) || columns[1];

        // Prepare Chart.js data
        const labels = data.map(row => row[xCol]);
        const values = data.map(row => row[yCol]);

        const colors = this.generateColors(data.length);

        const chartConfig = this.getChartConfig(
            chartType,
            labels,
            values,
            xCol,
            yCol,
            title || `${yCol} by ${xCol}`,
            colors
        );

        const chartHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { font-family: Arial, sans-serif; padding: 20px; margin: 0; }
        .chart-container {
            position: relative;
            height: 400px;
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
        }
        .chart-info {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="chart-container">
        <canvas id="myChart"></canvas>
    </div>
    <div class="chart-info">
        表名 | X轴: ${xCol} | Y轴: ${yCol} | 数据量: ${data.length} 条
    </div>
    <script>
        const config = ${JSON.stringify(chartConfig, null, 2)};
        const ctx = document.getElementById('myChart').getContext('2d');
        new Chart(ctx, config);
    </script>
</body>
</html>`;

        return { success: true, chart_html: chartHtml };
    }

    private static getChartConfig(
        type: string,
        labels: any[],
        data: any[],
        xLabel: string,
        yLabel: string,
        title: string,
        colors: string[]
    ) {
        const baseConfig = {
            type: type === 'histogram' ? 'bar' : type,
            data: {
                labels: labels,
                datasets: [{
                    label: yLabel,
                    data: data,
                    backgroundColor: colors.map(c => c + '80'), // Add transparency
                    borderColor: colors,
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    title: {
                        display: true,
                        text: title,
                        font: { size: 16 }
                    },
                    legend: {
                        display: type === 'pie'
                    }
                },
                scales: type === 'pie' ? {} : {
                    x: {
                        display: true,
                        title: {
                            display: true,
                            text: xLabel
                        }
                    },
                    y: {
                        display: true,
                        title: {
                            display: true,
                            text: yLabel
                        },
                        beginAtZero: true
                    }
                }
            }
        };

        return baseConfig;
    }

    private static generateColors(count: number): string[] {
        const colors = [
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF',
            '#FF9F40', '#FF6384', '#C9CBCF', '#4BC0C0', '#FF6384',
            '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF'
        ];

        // For large datasets, generate colors procedurally
        if (count <= colors.length) {
            return colors.slice(0, count);
        }

        return Array.from({ length: count }, (_, i) => {
            const hue = (i * 137.508) % 360; // Golden angle approximation
            return `hsl(${hue}, 70%, 60%)`;
        });
    }
}
