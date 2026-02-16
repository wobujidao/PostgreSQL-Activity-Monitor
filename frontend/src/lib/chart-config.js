import { ru } from 'date-fns/locale/ru';

export const CHART_COLORS = {
  connections: {
    border: 'rgb(59, 130, 246)',
    bgStart: 'rgba(59, 130, 246, 0.25)',
    bgEnd: 'rgba(59, 130, 246, 0.02)',
  },
  size: {
    border: 'rgb(139, 92, 246)',
    bgStart: 'rgba(139, 92, 246, 0.25)',
    bgEnd: 'rgba(139, 92, 246, 0.02)',
  },
  commits: {
    border: 'rgb(236, 72, 153)',
    bgStart: 'rgba(236, 72, 153, 0.25)',
    bgEnd: 'rgba(236, 72, 153, 0.02)',
  },
  sizeGb: {
    border: 'rgb(168, 85, 247)',
    bgStart: 'rgba(168, 85, 247, 0.25)',
    bgEnd: 'rgba(168, 85, 247, 0.02)',
  },
};

export function getTimeUnit(days) {
  if (days <= 2) return 'hour';
  if (days <= 14) return 'hour';
  if (days <= 90) return 'day';
  return 'week';
}

function isDarkMode() {
  return document.documentElement.classList.contains('dark');
}

export function chartOptions(yLabel, { days = 7 } = {}) {
  const dark = isDarkMode();
  const gridColor = dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';
  const textColor = dark ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.5)';
  const timeUnit = getTimeUnit(days);

  return {
    responsive: true,
    maintainAspectRatio: true,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: { display: false },
      title: { display: false },
      tooltip: {
        backgroundColor: dark ? 'rgba(30, 30, 30, 0.95)' : 'rgba(0, 0, 0, 0.85)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: dark ? 'rgba(255, 255, 255, 0.15)' : 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        displayColors: true,
        boxPadding: 4,
        titleFont: { size: 13, weight: 'bold' },
        bodyFont: { size: 12 },
        callbacks: {
          title: (items) => {
            if (!items.length) return '';
            const date = new Date(items[0].parsed.x);
            return date.toLocaleString('ru-RU', {
              day: '2-digit', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            });
          },
        },
      },
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: timeUnit,
          displayFormats: {
            hour: 'HH:mm',
            day: 'd MMM',
            week: 'd MMM',
            month: 'MMM yyyy',
          },
          tooltipFormat: 'dd.MM.yyyy HH:mm',
        },
        adapters: {
          date: { locale: ru },
        },
        title: { display: false },
        grid: {
          color: gridColor,
          drawBorder: false,
        },
        ticks: {
          maxRotation: 0,
          font: { size: 11 },
          color: textColor,
        },
      },
      y: {
        type: 'linear',
        title: {
          display: true,
          text: yLabel,
          font: { size: 12, weight: 'normal' },
          color: textColor,
        },
        grid: {
          color: gridColor,
          drawBorder: false,
        },
        ticks: {
          font: { size: 11 },
          color: textColor,
        },
        beginAtZero: true,
      },
    },
    animation: {
      duration: 750,
      easing: 'easeInOutQuart',
    },
  };
}

export function makeDataset(label, data, colors) {
  return {
    label,
    data,
    fill: true,
    borderColor: colors.border,
    backgroundColor: colors.bgStart,
    borderWidth: 2,
    tension: 0.35,
    pointRadius: 0,
    pointHoverRadius: 5,
    pointHoverBackgroundColor: colors.border,
    pointHoverBorderColor: '#fff',
    pointHoverBorderWidth: 2,
    _gradientStart: colors.bgStart,
    _gradientEnd: colors.bgEnd,
  };
}

export const gradientPlugin = {
  id: 'gradientFill',
  beforeDatasetDraw(chart) {
    const { ctx, chartArea } = chart;
    if (!chartArea) return;
    chart.data.datasets.forEach((dataset) => {
      if (dataset._gradientStart && dataset._gradientEnd) {
        const gradient = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
        gradient.addColorStop(0, dataset._gradientStart);
        gradient.addColorStop(1, dataset._gradientEnd);
        dataset.backgroundColor = gradient;
      }
    });
  },
};

export const DATE_RANGES = {
  '7 дней': 7,
  '2 недели': 14,
  'Месяц': 30,
  '3 месяца': 90,
  'Год': 365,
};
