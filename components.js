// Components: DOM wiring for wallets, transactions, dashboard, theme, export

import {
  computeAnalytics,
  createTransaction,
  addWallet,
  deleteWallet,
  findWallet,
  getState,
  getTheme,
  listTransactions,
  listWallets,
  setTheme,
  updateWallet,
} from "./services.js";

import { downloadFile, formatCurrency, toCSV, todayISO } from "./utils.js";
import { initCharts, updateCharts } from "./charts.js";

export function initApp() {
  const els = queryElements();
  applyInitialTheme(els);
  wireThemeToggle(els);
  wireExport(els);

  renderWallets(els);
  syncWalletSelects(els);

  wireWalletForm(els);
  wireWalletList(els);

  wireTransactionForm(els);
  wireTransactionFilters(els);
  renderTransactions(els);
  renderRecentTransactions(els);

  const analytics = computeAnalytics();
  renderAnalytics(els, analytics);
  initCharts(analytics);
}

function queryElements() {
  return {
    body: document.body,
    // Wallets
    walletId: document.getElementById("wallet-id"),
    walletForm: document.getElementById("wallet-form"),
    walletName: document.getElementById("wallet-name"),
    walletType: document.getElementById("wallet-type"),
    walletBalance: document.getElementById("wallet-balance"),
    walletList: document.getElementById("wallet-list"),
    walletSubmitButton: document.getElementById("wallet-submit-button"),
    walletCancelEdit: document.getElementById("wallet-cancel-edit"),
    walletError: document.getElementById("wallet-error"),
    // Transactions
    transactionForm: document.getElementById("transaction-form"),
    transactionWallet: document.getElementById("transaction-wallet"),
    transactionType: document.getElementById("transaction-type"),
    transactionAmount: document.getElementById("transaction-amount"),
    transactionCategory: document.getElementById("transaction-category"),
    transactionDate: document.getElementById("transaction-date"),
    transactionNote: document.getElementById("transaction-note"),
    transactionError: document.getElementById("transaction-error"),
    transactionsTableBody: document.getElementById("transactions-tbody"),
    transactionsEmpty: document.getElementById("transactions-empty"),
    recentTransactionsList: document.getElementById("recent-transactions-list"),
    // Filters
    filterWallet: document.getElementById("filter-wallet"),
    filterType: document.getElementById("filter-type"),
    filterCategory: document.getElementById("filter-category"),
    filterDateFrom: document.getElementById("filter-date-from"),
    filterDateTo: document.getElementById("filter-date-to"),
    // Analytics
    totalBalance: document.getElementById("total-balance"),
    walletCount: document.getElementById("wallet-count"),
    avgBalance: document.getElementById("avg-balance"),
    sumBank: document.getElementById("sum-bank"),
    sumCash: document.getElementById("sum-cash"),
    sumCrypto: document.getElementById("sum-crypto"),
    sumOther: document.getElementById("sum-other"),
    totalIncome: document.getElementById("total-income"),
    totalExpenses: document.getElementById("total-expenses"),
    netBalance: document.getElementById("net-balance"),
    // Theme & export
    themeToggle: document.getElementById("theme-toggle"),
    exportButton: document.getElementById("export-button"),
    exportMenuPanel: document.getElementById("export-menu-panel"),
  };
}

function applyInitialTheme({ body }) {
  const theme = getTheme();
  body.dataset.theme = theme;
}

function wireThemeToggle({ themeToggle, body }) {
  if (!themeToggle) return;
  themeToggle.addEventListener("click", () => {
    const next = body.dataset.theme === "dark" ? "light" : "dark";
    body.dataset.theme = next;
    setTheme(next);
  });
}

function wireExport({ exportButton, exportMenuPanel }) {
  if (!exportButton || !exportMenuPanel) return;

  exportButton.addEventListener("click", () => {
    exportMenuPanel.classList.toggle("export-menu-panel--open");
  });

  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (
      !exportMenuPanel.contains(target) &&
      target !== exportButton &&
      !exportButton.contains(target)
    ) {
      exportMenuPanel.classList.remove("export-menu-panel--open");
    }
  });

  exportMenuPanel.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLButtonElement)) return;
    const kind = target.dataset.export;
    if (!kind) return;
    handleExport(kind);
    exportMenuPanel.classList.remove("export-menu-panel--open");
  });
}

function handleExport(kind) {
  const { wallets, transactions } = getState();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  if (kind === "json") {
    const content = JSON.stringify({ wallets, transactions }, null, 2);
    downloadFile({
      filename: `wallet-dashboard-${timestamp}.json`,
      content,
      mimeType: "application/json",
    });
    return;
  }

  if (kind === "csv") {
    const walletRows = wallets.map((w) => ({
      id: w.id,
      name: w.name,
      type: w.type,
      balance: w.balance,
    }));

    const txRows = transactions.map((t) => ({
      id: t.id,
      walletId: t.walletId,
      type: t.type,
      amount: t.amount,
      category: t.category,
      date: t.date,
      note: t.note,
    }));

    const walletCsv = toCSV(walletRows);
    const txCsv = toCSV(txRows);
    const combined = [
      "# Wallets",
      walletCsv,
      "",
      "# Transactions",
      txCsv,
    ].join("\n");

    downloadFile({
      filename: `wallet-dashboard-${timestamp}.csv`,
      content: combined,
      mimeType: "text/csv",
    });
  }
}

// Wallets
function renderWallets(els) {
  const wallets = listWallets();
  if (!wallets.length) {
    els.walletList.innerHTML =
      '<div class="wallet-list-empty">No accounts yet. Add one below to get started.</div>';
    return;
  }

  const rows = wallets
    .map((wallet) => {
      const icon =
        wallet.type === "bank"    ? "🏦"
        : wallet.type === "cash"  ? "💵"
        : wallet.type === "crypto"? "🪙"
        : "📁";

      const typeLabel =
        wallet.type.charAt(0).toUpperCase() + wallet.type.slice(1);

      return `
        <div class="wallet-row" data-id="${wallet.id}" data-type="${wallet.type}">
          <div class="wallet-card-top">
            <span class="wallet-card-icon" aria-hidden="true">${icon}</span>
            <div class="wallet-card-actions">
              <button type="button" class="wallet-action-btn wallet-edit" title="Edit account">✏️</button>
              <button type="button" class="wallet-action-btn delete-btn wallet-delete" title="Delete account">🗑️</button>
            </div>
          </div>
          <div class="wallet-card-name">${wallet.name}</div>
          <div class="wallet-card-type">${typeLabel}</div>
          <div class="wallet-card-balance">${formatCurrency(wallet.balance)}</div>
        </div>
      `;
    })
    .join("");

  els.walletList.innerHTML = rows;
}

function syncWalletSelects(els) {
  const wallets = listWallets();

  // Guard: if the selects are missing, do nothing (prevents runtime errors
  // that would stop wallet form JS from running).
  if (!els.transactionWallet || !els.filterWallet) return;

  const previousWalletSelection = els.transactionWallet.value;

  const optionsHtml = wallets
    .map(
      (w) => `<option value="${w.id}">${w.name}</option>`
    )
    .join("");

  if (wallets.length) {
    els.transactionWallet.innerHTML = optionsHtml;

    // Prefer to keep the previous selection if it still exists;
    // otherwise select the most recently added wallet.
    const stillExists = wallets.some((w) => w.id === previousWalletSelection);
    els.transactionWallet.value = stillExists
      ? previousWalletSelection
      : wallets[wallets.length - 1].id;
  } else {
    els.transactionWallet.innerHTML = '<option value="">No wallets</option>';
  }

  els.filterWallet.innerHTML =
    '<option value="">All</option>' +
    wallets
      .map((w) => `<option value="${w.id}">${w.name}</option>`)
      .join("");
}

function resetWalletForm(els) {
  els.walletId.value = "";
  els.walletForm.reset();
  els.walletType.value = "bank";
  els.walletSubmitButton.textContent = "Save account";
  els.walletCancelEdit.style.display = "none";
  els.walletError.textContent = "";
}

function wireWalletForm(els) {
  resetWalletForm(els);
  els.walletCancelEdit.addEventListener("click", () => resetWalletForm(els));

  els.walletForm.addEventListener("submit", (event) => {
    event.preventDefault();
    els.walletError.textContent = "";

    const id = els.walletId.value || null;
    const payload = {
      name: els.walletName.value,
      type: els.walletType.value,
      startingBalance: els.walletBalance.value,
    };

    // Delegate wallet manipulation to dedicated helpers.
    const result = id ? updateWallet(id, payload) : addWallet(payload);

    if (result.error) {
      els.walletError.textContent = result.error;
      return;
    }

    // Immediately reflect the new wallet in UI.
    resetWalletForm(els);
    renderWallets(els);
    syncWalletSelects(els);

    const analytics = computeAnalytics();
    renderAnalytics(els, analytics);
    renderRecentTransactions(els);
    updateCharts(analytics);
  });
}

function wireWalletList(els) {
  els.walletList.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;

    const row = target.closest(".wallet-row");
    if (!row) return;
    const id = row.getAttribute("data-id");
    if (!id) return;

    if (target.classList.contains("wallet-edit")) {
      const wallet = findWallet(id);
      if (!wallet) return;

      els.walletId.value = wallet.id;
      els.walletName.value = wallet.name;
      els.walletType.value = wallet.type;
      els.walletBalance.value = wallet.balance.toString();
      els.walletSubmitButton.textContent = "Update wallet";
      els.walletCancelEdit.style.display = "inline-flex";
      els.walletName.focus();
      return;
    }

    if (target.classList.contains("wallet-delete")) {
      const wallet = findWallet(id);
      if (!wallet) return;
      const confirmed = window.confirm(
        `Delete wallet "${wallet.name}"?\n\nIf it has transactions, delete those first.`
      );
      if (!confirmed) return;

      const result = deleteWallet(id);
      if (result.error) {
        els.walletError.textContent = result.error;
        return;
      }

      resetWalletForm(els);
      renderWallets(els);
      syncWalletSelects(els);

      const analytics = computeAnalytics();
      renderAnalytics(els, analytics);
      renderRecentTransactions(els);
      updateCharts(analytics);
    }
  });
}

// Transactions
function wireTransactionForm(els) {
  els.transactionDate.value = todayISO();

  els.transactionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    els.transactionError.textContent = "";

    const payload = {
      walletId: els.transactionWallet.value,
      type: els.transactionType.value,
      amount: els.transactionAmount.value,
      category: els.transactionCategory.value,
      date: els.transactionDate.value,
      note: els.transactionNote.value,
    };

    const result = createTransaction(payload);
    if (result.error) {
      els.transactionError.textContent = result.error;
      return;
    }

    els.transactionForm.reset();
    els.transactionType.value = "income";
    els.transactionDate.value = todayISO();
    syncWalletSelects(els);

    renderWallets(els);
    renderTransactions(els);
    renderRecentTransactions(els);

    const analytics = computeAnalytics();
    renderAnalytics(els, analytics);
    updateCharts(analytics);
  });
}

function wireTransactionFilters(els) {
  const inputs = [
    els.filterWallet,
    els.filterType,
    els.filterCategory,
    els.filterDateFrom,
    els.filterDateTo,
  ];

  const rerender = () => renderTransactions(els);
  for (const input of inputs) {
    if (!input) continue;
    input.addEventListener("input", rerender);
    if (input instanceof HTMLSelectElement) {
      input.addEventListener("change", rerender);
    }
  }
}

function applyTransactionFilters(els, transactions) {
  const walletId = els.filterWallet.value;
  const type = els.filterType.value;
  const category = els.filterCategory.value.trim().toLowerCase();
  const from = els.filterDateFrom.value;
  const to = els.filterDateTo.value;

  return transactions.filter((t) => {
    if (walletId && t.walletId !== walletId) return false;
    if (type && t.type !== type) return false;
    if (category && !t.category.toLowerCase().includes(category)) return false;
    if (from && t.date < from) return false;
    if (to && t.date > to) return false;
    return true;
  });
}

function renderTransactions(els) {
  const allTransactions = listTransactions();
  const filtered = applyTransactionFilters(els, allTransactions);
  const walletsMap = new Map(listWallets().map((w) => [w.id, w]));

  if (!filtered.length) {
    els.transactionsTableBody.innerHTML = "";
    els.transactionsEmpty.style.display = "flex";
    return;
  }

  const rows = filtered
    .map((t) => {
      const wallet = walletsMap.get(t.walletId);
      const walletName = wallet ? wallet.name : "Unknown";
      const typeLabel = t.type === "income" ? "Income" : "Expense";
      const typeClass = t.type === "income" ? "tx-income" : "tx-expense";

      return `
        <tr>
          <td>${t.date}</td>
          <td>${walletName}</td>
          <td><span class="tx-type ${typeClass}">${typeLabel}</span></td>
          <td>${t.category}</td>
          <td class="align-right">${formatCurrency(t.amount)}</td>
          <td>${t.note || ""}</td>
        </tr>
      `;
    })
    .join("");

  els.transactionsTableBody.innerHTML = rows;
  els.transactionsEmpty.style.display = "none";
}


// Recent transactions mini-list (dashboard sidebar)
function renderRecentTransactions(els) {
  const el = els.recentTransactionsList;
  if (!el) return;
  const transactions = listTransactions().slice(0, 8);
  const walletsMap = new Map(listWallets().map((w) => [w.id, w]));

  if (!transactions.length) {
    el.innerHTML = '<div class="empty-sm">No records yet</div>';
    return;
  }

  el.innerHTML = transactions.map((t) => {
    const isIncome = t.type === "income";
    const dotClass = isIncome ? "tx-dot-income" : "tx-dot-expense";
    const amtClass = isIncome ? "amt-income" : "amt-expense";
    const prefix = isIncome ? "+" : "−";
    const wallet = walletsMap.get(t.walletId);
    const walletName = wallet ? wallet.name : "Unknown";
    return `
      <div class="recent-tx-item">
        <span class="tx-dot ${dotClass}">${isIncome ? "↑" : "↓"}</span>
        <div class="recent-tx-body">
          <div class="recent-tx-cat">${t.category}</div>
          <div class="recent-tx-date">${t.date} · ${walletName}</div>
        </div>
        <span class="recent-tx-amount ${amtClass}">${prefix}${formatCurrency(t.amount)}</span>
      </div>
    `;
  }).join("");
}

// Analytics
function renderAnalytics(els, analytics) {
  els.totalBalance.textContent = formatCurrency(analytics.totalBalance);
  els.walletCount.textContent = String(analytics.walletCount);
  els.avgBalance.textContent = formatCurrency(analytics.avgBalance);

  els.sumBank.textContent = formatCurrency(analytics.byType.bank || 0);
  els.sumCash.textContent = formatCurrency(analytics.byType.cash || 0);
  els.sumCrypto.textContent = formatCurrency(analytics.byType.crypto || 0);
  els.sumOther.textContent = formatCurrency(analytics.byType.other || 0);

  els.totalIncome.textContent = formatCurrency(analytics.totalIncome);
  els.totalExpenses.textContent = formatCurrency(analytics.totalExpenses);
  els.netBalance.textContent = formatCurrency(analytics.net);
}

