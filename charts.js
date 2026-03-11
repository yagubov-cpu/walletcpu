// Chart.js integration and updates

import { formatCurrency } from "./utils.js";

let categoryChart;
let monthlyChart;
let walletChart;

export function initCharts(analytics) {
  const categoryCtx = document.getElementById("chart-category");
  const monthlyCtx = document.getElementById("chart-monthly");
  const walletCtx = document.getElementById("chart-wallets");

  if (!(window.Chart && categoryCtx && monthlyCtx && walletCtx)) {
    return;
  }

  const categoryData = toCategoryData(analytics.byCategory);
  const monthlyData = toMonthlyData(analytics.byMonth);
  const walletData = toWalletData(analytics.byWalletSpending);

  categoryChart = new Chart(categoryCtx, {
    type: "pie",
    data: {
      labels: categoryData.labels,
      datasets: [
        {
          label: "Spending by category",
          data: categoryData.values,
          backgroundColor: categoryData.colors,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          align: "center",
          labels: {
            color: "#e2e8f0",
            usePointStyle: true,
            boxWidth: 8,
            padding: 16,
            font: {
              family: "DM Sans, system-ui, -apple-system, sans-serif",
              size: 11,
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(13,17,23,0.97)",
          borderColor: "rgba(99,179,237,0.35)",
          borderWidth: 1,
          padding: 10,
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
      layout: {
        padding: {
          top: 4,
          right: 12,
          bottom: 4,
          left: 12,
        },
      },
      maintainAspectRatio: false,
    },
  });

  monthlyChart = new Chart(monthlyCtx, {
    type: "bar",
    data: {
      labels: monthlyData.labels,
      datasets: [
        {
          label: "Income",
          data: monthlyData.income,
          backgroundColor: "rgba(52, 211, 153, 0.88)",
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 32,
        },
        {
          label: "Expenses",
          data: monthlyData.expense,
          backgroundColor: "rgba(248, 113, 113, 0.90)",
          borderRadius: 6,
          borderSkipped: false,
          maxBarThickness: 32,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: {
          top: 8,
          right: 16,
          left: 4,
          bottom: 0,
        },
      },
      scales: {
        x: {
          ticks: {
            color: "#64748b",
            padding: 6,
            font: {
              family: "DM Sans, system-ui, -apple-system, sans-serif",
              size: 11,
            },
          },
          grid: {
            display: false,
            drawBorder: false,
          },
        },
        y: {
          ticks: {
            color: "#64748b",
            padding: 6,
            font: {
              family: "DM Sans, system-ui, -apple-system, sans-serif",
              size: 11,
            },
            callback: (value) => formatCurrency(value),
          },
          grid: {
            color: "rgba(99,179,237,0.09)",
            drawBorder: false,
            borderDash: [4, 4],
          },
        },
      },
      plugins: {
        legend: {
          position: "top",
          align: "end",
          labels: {
            color: "#e2e8f0",
            usePointStyle: true,
            boxWidth: 8,
            padding: 12,
            font: {
              family: "DM Sans, system-ui, -apple-system, sans-serif",
              size: 11,
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(13,17,23,0.97)",
          borderColor: "rgba(99,179,237,0.35)",
          borderWidth: 1,
          padding: 10,
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}`,
          },
        },
      },
    },
  });

  walletChart = new Chart(walletCtx, {
    type: "doughnut",
    data: {
      labels: walletData.labels,
      datasets: [
        {
          label: "Wallet distribution",
          data: walletData.values,
          backgroundColor: walletData.colors,
        },
      ],
    },
    options: {
      plugins: {
        legend: {
          position: "bottom",
          align: "center",
          labels: {
            color: "#e2e8f0",
            usePointStyle: true,
            boxWidth: 8,
            padding: 16,
            font: {
              family: "DM Sans, system-ui, -apple-system, sans-serif",
              size: 11,
            },
          },
        },
        tooltip: {
          backgroundColor: "rgba(13,17,23,0.97)",
          borderColor: "rgba(99,179,237,0.35)",
          borderWidth: 1,
          padding: 10,
          titleColor: "#e2e8f0",
          bodyColor: "#94a3b8",
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
      cutout: "55%",
      layout: {
        padding: {
          top: 4,
          right: 12,
          bottom: 4,
          left: 12,
        },
      },
      maintainAspectRatio: false,
    },
  });
}

export function updateCharts(analytics) {
  if (!window.Chart) return;

  const categoryData = toCategoryData(analytics.byCategory);
  const monthlyData = toMonthlyData(analytics.byMonth);
  const walletData = toWalletData(analytics.byWalletSpending);

  if (categoryChart) {
    categoryChart.data.labels = categoryData.labels;
    categoryChart.data.datasets[0].data = categoryData.values;
    categoryChart.data.datasets[0].backgroundColor = categoryData.colors;
    categoryChart.update();
  }

  if (monthlyChart) {
    monthlyChart.data.labels = monthlyData.labels;
    monthlyChart.data.datasets[0].data = monthlyData.income;
    monthlyChart.data.datasets[1].data = monthlyData.expense;
    monthlyChart.update();
  }

  if (walletChart) {
    walletChart.data.labels = walletData.labels;
    walletChart.data.datasets[0].data = walletData.values;
    walletChart.data.datasets[0].backgroundColor = walletData.colors;
    walletChart.update();
  }
}

function toCategoryData(byCategory) {
  const entries = Object.entries(byCategory || {}).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([key]) => key);
  const values = entries.map(([, value]) => value);
  const colors = generateColors(values.length);
  return { labels, values, colors };
}

function toMonthlyData(byMonth) {
  const keys = Object.keys(byMonth || {}).sort();
  const income = keys.map((k) => byMonth[k].income || 0);
  const expense = keys.map((k) => byMonth[k].expense || 0);
  return { labels: keys, income, expense };
}

function toWalletData(byWalletSpending) {
  const entries = Object.entries(byWalletSpending || {}).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([name]) => name);
  const values = entries.map(([, value]) => value);
  const colors = generateColors(values.length);
  return { labels, values, colors };
}

function generateColors(count) {
  const baseColors = [
    "#63B3ED",
    "#34d399",
    "#fbbf24",
    "#f87171",
    "#a78bfa",
    "#22d3ee",
  ];
  if (count <= baseColors.length) return baseColors.slice(0, count);
  const colors = [];
  for (let i = 0; i < count; i += 1) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
}

