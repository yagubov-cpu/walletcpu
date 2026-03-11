// charts.js — Chart.js integration
// All chart instances are kept in module scope so updateCharts() can patch them.

import { formatCurrency } from "./utils.js";

let categoryChart = null;
let monthlyChart  = null;
let walletChart   = null;

// Palette shared by all charts
const COLORS = ["#63B3ED","#34d399","#fbbf24","#f87171","#a78bfa","#22d3ee","#fb923c","#e879f9"];

function generateColors(count) {
  const out = [];
  for (let i = 0; i < count; i++) out.push(COLORS[i % COLORS.length]);
  return out;
}

// ── Common tooltip / legend config ────────────────────────────
const TOOLTIP_DEFAULTS = {
  backgroundColor: "rgba(13,17,23,0.97)",
  borderColor: "rgba(99,179,237,0.35)",
  borderWidth: 1,
  padding: 10,
  titleColor: "#e2e8f0",
  bodyColor: "#94a3b8",
};
const LEGEND_LABEL_DEFAULTS = {
  color: "#e2e8f0",
  usePointStyle: true,
  boxWidth: 8,
  padding: 14,
  font: { family: "DM Sans, system-ui, sans-serif", size: 11 },
};

// ── initCharts ─────────────────────────────────────────────────
// Called once after bootDashboard(). Uses requestAnimationFrame to
// ensure the app-shell is visible and canvas elements have real
// dimensions before Chart.js tries to measure them.  Without this
// delay the canvases have clientWidth = 0 (because their parent had
// `hidden`) and Chart.js renders an invisible 0×0 chart.
export function initCharts(analytics) {
  // Destroy any leftover instances from a previous session
  // (e.g. user signed out then signed back in without a page reload).
  [categoryChart, monthlyChart, walletChart].forEach(c => c?.destroy());
  categoryChart = monthlyChart = walletChart = null;

  // Double-rAF: first frame removes `hidden`, second frame has layout.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      _buildCharts(analytics);
    });
  });
}

function _buildCharts(analytics) {
  if (!window.Chart) {
    console.warn("[charts] Chart.js not loaded yet — retrying in 200ms");
    setTimeout(() => _buildCharts(analytics), 200);
    return;
  }

  const categoryCtx = document.getElementById("chart-category");
  const monthlyCtx  = document.getElementById("chart-monthly");
  const walletCtx   = document.getElementById("chart-wallets");

  if (!categoryCtx || !monthlyCtx || !walletCtx) {
    console.warn("[charts] Canvas elements not found");
    return;
  }

  const catData     = toCategoryData(analytics.byCategory);
  const monthData   = toMonthlyData(analytics.byMonth);
  const walletData  = toWalletData(analytics.byWalletSpending);

  // ── Category (pie) ─────────────────────────────────────────
  categoryChart = new Chart(categoryCtx, {
    type: "pie",
    data: {
      labels: catData.labels,
      datasets: [{ label: "Spending by category", data: catData.values, backgroundColor: catData.colors }],
    },
    options: {
      maintainAspectRatio: false,
      layout: { padding: { top: 4, right: 12, bottom: 4, left: 12 } },
      plugins: {
        legend: { position: "bottom", align: "center", labels: LEGEND_LABEL_DEFAULTS },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` },
        },
      },
    },
  });

  // ── Monthly cash flow (bar) ────────────────────────────────
  monthlyChart = new Chart(monthlyCtx, {
    type: "bar",
    data: {
      labels: monthData.labels,
      datasets: [
        { label: "Income",   data: monthData.income,  backgroundColor: "rgba(52,211,153,0.88)", borderRadius: 6, borderSkipped: false, maxBarThickness: 32 },
        { label: "Expenses", data: monthData.expense, backgroundColor: "rgba(248,113,113,0.90)", borderRadius: 6, borderSkipped: false, maxBarThickness: 32 },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 16, left: 4, bottom: 0 } },
      scales: {
        x: {
          ticks: { color: "#64748b", padding: 6, font: { family: "DM Sans, system-ui, sans-serif", size: 11 } },
          grid:  { display: false },
        },
        y: {
          ticks: { color: "#64748b", padding: 6, font: { family: "DM Sans, system-ui, sans-serif", size: 11 }, callback: (v) => formatCurrency(v) },
          grid:  { color: "rgba(99,179,237,0.09)", borderDash: [4,4] },
        },
      },
      plugins: {
        legend: { position: "top", align: "end", labels: LEGEND_LABEL_DEFAULTS },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.parsed.y)}` },
        },
      },
    },
  });

  // ── Wallet split (doughnut) ────────────────────────────────
  walletChart = new Chart(walletCtx, {
    type: "doughnut",
    data: {
      labels: walletData.labels,
      datasets: [{ label: "Wallet distribution", data: walletData.values, backgroundColor: walletData.colors }],
    },
    options: {
      cutout: "55%",
      maintainAspectRatio: false,
      layout: { padding: { top: 4, right: 12, bottom: 4, left: 12 } },
      plugins: {
        legend: { position: "bottom", align: "center", labels: LEGEND_LABEL_DEFAULTS },
        tooltip: {
          ...TOOLTIP_DEFAULTS,
          callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.parsed)}` },
        },
      },
    },
  });
}

// ── updateCharts ───────────────────────────────────────────────
export function updateCharts(analytics) {
  if (!window.Chart) return;

  const catData    = toCategoryData(analytics.byCategory);
  const monthData  = toMonthlyData(analytics.byMonth);
  const walletData = toWalletData(analytics.byWalletSpending);

  if (categoryChart) {
    categoryChart.data.labels = catData.labels;
    categoryChart.data.datasets[0].data = catData.values;
    categoryChart.data.datasets[0].backgroundColor = catData.colors;
    categoryChart.update();
  }
  if (monthlyChart) {
    monthlyChart.data.labels = monthData.labels;
    monthlyChart.data.datasets[0].data = monthData.income;
    monthlyChart.data.datasets[1].data = monthData.expense;
    monthlyChart.update();
  }
  if (walletChart) {
    walletChart.data.labels = walletData.labels;
    walletChart.data.datasets[0].data = walletData.values;
    walletChart.data.datasets[0].backgroundColor = walletData.colors;
    walletChart.update();
  }
}

// ── Data transformers ──────────────────────────────────────────

function toCategoryData(byCategory) {
  const entries = Object.entries(byCategory || {}).sort((a,b) => b[1]-a[1]);
  return { labels: entries.map(([k]) => k), values: entries.map(([,v]) => v), colors: generateColors(entries.length) };
}

function toMonthlyData(byMonth) {
  const keys = Object.keys(byMonth || {}).sort();
  return {
    labels: keys,
    income:  keys.map(k => byMonth[k].income  || 0),
    expense: keys.map(k => byMonth[k].expense || 0),
  };
}

function toWalletData(byWalletSpending) {
  const entries = Object.entries(byWalletSpending || {}).sort((a,b) => b[1]-a[1]);
  return { labels: entries.map(([n]) => n), values: entries.map(([,v]) => v), colors: generateColors(entries.length) };
}