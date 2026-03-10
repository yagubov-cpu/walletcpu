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
        legend: { position: "bottom", labels: { color: "inherit" } },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
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
          backgroundColor: "rgba(34, 197, 94, 0.7)",
        },
        {
          label: "Expenses",
          data: monthlyData.expense,
          backgroundColor: "rgba(248, 113, 113, 0.8)",
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        x: {
          ticks: { color: "inherit" },
          grid: { display: false },
        },
        y: {
          ticks: {
            color: "inherit",
            callback: (value) => formatCurrency(value),
          },
          grid: { color: "rgba(148, 163, 184, 0.2)" },
        },
      },
      plugins: {
        legend: { labels: { color: "inherit" } },
        tooltip: {
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
        legend: { position: "bottom", labels: { color: "inherit" } },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.label}: ${formatCurrency(ctx.parsed)}`,
          },
        },
      },
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
    "#38bdf8",
    "#f97373",
    "#facc15",
    "#a855f7",
    "#22c55e",
    "#fb923c",
    "#6366f1",
    "#ec4899",
  ];
  if (count <= baseColors.length) return baseColors.slice(0, count);
  const colors = [];
  for (let i = 0; i < count; i += 1) {
    colors.push(baseColors[i % baseColors.length]);
  }
  return colors;
}

