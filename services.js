// Services: storage, wallets, transactions, analytics, theme

import { deepClone, formatCurrency, monthKeyFromISO, parseNumber, todayISO } from "./utils.js";

const STORAGE_KEY = "wallet-dashboard-v1";

const DEFAULT_STATE = {
  wallets: [],
  transactions: [],
  preferences: {
    theme: "dark",
  },
};

function safeLoad() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return deepClone(DEFAULT_STATE);
    const parsed = JSON.parse(raw);
    return {
      wallets: Array.isArray(parsed.wallets) ? parsed.wallets : [],
      transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
      preferences: {
        ...DEFAULT_STATE.preferences,
        ...(parsed.preferences || {}),
      },
    };
  } catch {
    return deepClone(DEFAULT_STATE);
  }
}

let state = safeLoad();

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

export function getState() {
  return deepClone(state);
}

// Theme
export function getTheme() {
  return state.preferences.theme === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  state.preferences.theme = theme === "light" ? "light" : "dark";
  persist();
}

// Wallets
export function listWallets() {
  return deepClone(state.wallets);
}

export function addWallet({ name, type, startingBalance }) {
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Wallet name is required." };
  }
  const amount = parseNumber(startingBalance);
  if (!Number.isFinite(amount)) {
    return { error: "Starting balance must be a number." };
  }
  const existing = state.wallets.find(
    (w) => w.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (existing) {
    return { error: "A wallet with this name already exists." };
  }
  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const wallet = {
    id,
    name: trimmedName,
    type,
    balance: amount,
  };
  state.wallets.push(wallet);
  persist();
  return { wallet: deepClone(wallet) };
}

export function updateWallet(id, { name, type, startingBalance }) {
  const wallet = state.wallets.find((w) => w.id === id);
  if (!wallet) {
    return { error: "Wallet not found." };
  }
  const trimmedName = name.trim();
  if (!trimmedName) {
    return { error: "Wallet name is required." };
  }
  const amount = parseNumber(startingBalance);
  if (!Number.isFinite(amount)) {
    return { error: "Starting balance must be a number." };
  }
  const duplicate = state.wallets.find(
    (w) =>
      w.id !== id && w.name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (duplicate) {
    return { error: "Another wallet with this name already exists." };
  }

  // When editing, we only update metadata and balance baseline.
  wallet.name = trimmedName;
  wallet.type = type;
  wallet.balance = amount;

  persist();
  return { wallet: deepClone(wallet) };
}

export function deleteWallet(id) {
  const hasTransactions = state.transactions.some((t) => t.walletId === id);
  if (hasTransactions) {
    return {
      error:
        "This wallet has transactions. Delete or reassign those transactions first.",
    };
  }
  const before = state.wallets.length;
  state.wallets = state.wallets.filter((w) => w.id !== id);
  if (state.wallets.length === before) {
    return { error: "Wallet not found." };
  }
  persist();
  return { success: true };
}

export function findWallet(id) {
  return deepClone(state.wallets.find((w) => w.id === id) || null);
}

// Transactions
export function listTransactions() {
  return deepClone(state.transactions);
}

export function createTransaction({
  walletId,
  type,
  amount,
  category,
  date,
  note,
}) {
  const wallet = state.wallets.find((w) => w.id === walletId);
  if (!wallet) {
    return { error: "Wallet is required." };
  }

  const numericAmount = parseNumber(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { error: "Amount must be a positive number." };
  }

  const trimmedCategory = category.trim();
  if (!trimmedCategory) {
    return { error: "Category is required." };
  }

  const dateISO = date || todayISO();

  if (type === "expense" && wallet.balance < numericAmount) {
    return {
      error: `Expense exceeds wallet balance (${formatCurrency(wallet.balance)}).`,
    };
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const transaction = {
    id,
    walletId,
    amount: numericAmount,
    type: type === "income" ? "income" : "expense",
    category: trimmedCategory,
    date: dateISO,
    note: note?.trim() || "",
  };

  // Apply side-effect: update wallet balance
  if (transaction.type === "income") {
    wallet.balance += numericAmount;
  } else if (transaction.type === "expense") {
    wallet.balance -= numericAmount;
  }

  state.transactions.unshift(transaction);
  persist();

  return { transaction: deepClone(transaction), wallet: deepClone(wallet) };
}

// Analytics
export function computeAnalytics() {
  const wallets = state.wallets;
  const transactions = state.transactions;

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
  const walletCount = wallets.length;
  const avgBalance = walletCount ? totalBalance / walletCount : 0;

  const byType = wallets.reduce(
    (acc, w) => {
      if (!acc[w.type]) acc[w.type] = 0;
      acc[w.type] += w.balance;
      return acc;
    },
    { bank: 0, cash: 0, crypto: 0, other: 0 }
  );

  let totalIncome = 0;
  let totalExpenses = 0;
  const byCategory = {};
  const byWalletSpending = {};
  const byMonth = {};

  for (const tx of transactions) {
    const monthKey = monthKeyFromISO(tx.date);
    if (!byMonth[monthKey]) {
      byMonth[monthKey] = { income: 0, expense: 0 };
    }

    if (tx.type === "income") {
      totalIncome += tx.amount;
      byMonth[monthKey].income += tx.amount;
    } else if (tx.type === "expense") {
      totalExpenses += tx.amount;
      byMonth[monthKey].expense += tx.amount;

      const catKey = tx.category.toLowerCase();
      byCategory[catKey] = (byCategory[catKey] || 0) + tx.amount;

      const wallet = state.wallets.find((w) => w.id === tx.walletId);
      const walletName = wallet ? wallet.name : "Unknown";
      byWalletSpending[walletName] =
        (byWalletSpending[walletName] || 0) + tx.amount;
    }
  }

  const net = totalIncome - totalExpenses;

  return {
    totalBalance,
    walletCount,
    avgBalance,
    byType,
    totalIncome,
    totalExpenses,
    net,
    byCategory,
    byWalletSpending,
    byMonth,
  };
}

