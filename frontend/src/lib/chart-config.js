import { ru } from 'date-fns/locale/ru';

function getCSSColorParams(varName) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(varName).trim();
  // raw = "hsl(217 91% 60%)" — extract params inside hsl()
  const match = raw.match(/hsl\(\s*(.+?)\s*\)/);
  return match ? match[1] : raw;
}

function makeChartColor(cssVar) {
  const params = getCSSColorParams(cssVar);
  return {
    border: `hsl(${params})`,
    bgStart: `hsl(${params} / 0.25)`,
    bgEnd: `hsl(${params} / 0.02)`,
  };
}

export function getChartColors() {
  return {
    connections: makeChartColor('--chart-1'),
    size: makeChartColor('--chart-5'),
    commits: makeChartColor('--chart-4'),
    sizeGb: makeChartColor('--chart-5'),
  };
}

// Backward compat — вызывается лениво в useEffect, не при импорте
export const CHART_COLORS = {
  get connections() { return getChartColors().connections; },
  get size() { return getChartColors().size; },
  get commits() { return getChartColors().commits; },
  get sizeGb() { return getChartColors().sizeGb; },
};

export function getTimeUnit(days) {
  if (days <= 2) return 'hour';
  if (days <= 30) return 'day';
  if (days <= 180) return 'week';
  return 'month';
}

function isDarkMode() {
  return document.documentElement.classList.contains('dark');
}

export function chartOptions(yLabel, { days = 7 } = {}) {
  const dark = isDarkMode();
  const borderParams = getCSSColorParams('--border');
  const mutedFgParams = getCSSColorParams('--muted-foreground');
  const gridColor = `hsl(${borderParams} / ${dark ? '0.3' : '0.5'})`;
  const textColor = `hsl(${mutedFgParams})`;
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
          maxTicksLimit: 12,
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
