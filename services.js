// services.js — Supabase-backed data layer
// All exported function signatures remain IDENTICAL to the localStorage
// version so most of components.js needs zero changes.

import {
  getTransactions   as sbGetTransactions,
  addTransaction    as sbAddTransaction,
  deleteTransaction as sbDeleteTransaction,
  updateTransaction as sbUpdateTransaction,
} from "./supabase.js";

import {
  deepClone,
  formatCurrency,
  monthKeyFromISO,
  parseNumber,
  todayISO,
} from "./utils.js";

// ── Theme (localStorage — no DB column needed) ────────────────
const PREF_KEY = "wallet-dashboard-prefs-v1";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? JSON.parse(raw) : { theme: "dark" };
  } catch { return { theme: "dark" }; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); } catch {}
}
export function getTheme()        { return loadPrefs().theme === "light" ? "light" : "dark"; }
export function setTheme(theme)   { const p = loadPrefs(); p.theme = theme === "light" ? "light" : "dark"; savePrefs(p); }

// ── Active user ───────────────────────────────────────────────
// Set once after auth resolves; cleared on sign-out.
// Every DB write guards on this being non-null.
let _currentUserId = null;

export function setCurrentUser(userId) { _currentUserId = userId || null; }
export function getCurrentUserId()     { return _currentUserId; }

// ── In-memory transaction cache ───────────────────────────────
// Populated by loadAllTransactions(), kept in sync by CRUD helpers.
// Cleared by resetState() on sign-out so the next sign-in starts fresh.
let _txCache = [];

// ── Wallets — per-user localStorage key ──────────────────────
// Keying by userId means two accounts on the same browser never share
// wallet definitions, preventing data from one user bleeding into another.
function walletKey() {
  return _currentUserId
    ? `wallet-dashboard-wallets-${_currentUserId}`
    : "wallet-dashboard-wallets-anon";
}
function loadWallets() {
  try {
    const raw = localStorage.getItem(walletKey());
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
function saveWallets(w) {
  try { localStorage.setItem(walletKey(), JSON.stringify(w)); } catch {}
}

let _wallets = [];

// ── Full state reset (called on sign-out) ─────────────────────
export function resetState() {
  _currentUserId = null;
  _txCache       = [];
  _wallets       = [];
}

// ── Bootstrap: fetch all transactions for the current user ────
// Re-loads wallets from the per-user localStorage key every call so
// that switching accounts immediately picks up the right wallet set.
export async function loadAllTransactions() {
  if (!_currentUserId) {
    return { error: { message: "Cannot load transactions: no authenticated user." } };
  }
  _wallets = loadWallets(); // reload per-user wallets from localStorage

  const { data, error } = await sbGetTransactions(_currentUserId);
  if (error) {
    console.error("[services] Failed to load transactions:", error.message);
    return { error };
  }
  _txCache = (data || []).map(normalizeTx);
  return { error: null };
}

function normalizeTx(row) {
  return {
    id:       String(row.id),
    walletId: row.walletId ?? row.wallet_id ?? null,
    title:    row.title    ?? "",
    amount:   Number(row.amount) || 0,
    type:     row.type === "income" ? "income" : "expense",
    category: row.category ?? "Uncategorised",
    date:     row.date     ?? todayISO(),
    note:     row.note     ?? "",
  };
}

// ── getState (used by export helpers) ────────────────────────
export function getState() {
  return deepClone({ wallets: _wallets, transactions: _txCache });
}

// ── Wallets ───────────────────────────────────────────────────

export function listWallets() { return deepClone(_wallets); }

export function addWallet({ name, type, startingBalance }) {
  const trimmedName = (name || "").trim();
  if (!trimmedName) return { error: "Wallet name is required." };

  const amount = parseNumber(startingBalance);
  if (!Number.isFinite(amount)) return { error: "Starting balance must be a number." };

  if (_wallets.find(w => w.name.toLowerCase() === trimmedName.toLowerCase()))
    return { error: "A wallet with this name already exists." };

  const id     = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const wallet = { id, name: trimmedName, type, balance: amount };
  _wallets.push(wallet);
  saveWallets(_wallets);
  return { wallet: deepClone(wallet) };
}

export function updateWallet(id, { name, type, startingBalance }) {
  const wallet = _wallets.find(w => w.id === id);
  if (!wallet) return { error: "Wallet not found." };

  const trimmedName = (name || "").trim();
  if (!trimmedName) return { error: "Wallet name is required." };

  const amount = parseNumber(startingBalance);
  if (!Number.isFinite(amount)) return { error: "Starting balance must be a number." };

  if (_wallets.find(w => w.id !== id && w.name.toLowerCase() === trimmedName.toLowerCase()))
    return { error: "Another wallet with this name already exists." };

  wallet.name    = trimmedName;
  wallet.type    = type;
  wallet.balance = amount;
  saveWallets(_wallets);
  return { wallet: deepClone(wallet) };
}

export function deleteWallet(id) {
  if (_txCache.some(t => t.walletId === id))
    return { error: "This wallet has transactions. Delete or reassign those first." };
  const before = _wallets.length;
  _wallets = _wallets.filter(w => w.id !== id);
  if (_wallets.length === before) return { error: "Wallet not found." };
  saveWallets(_wallets);
  return { success: true };
}

export function findWallet(id) {
  return deepClone(_wallets.find(w => w.id === id) || null);
}

// ── Transactions ──────────────────────────────────────────────

export function listTransactions() { return deepClone(_txCache); }

export async function createTransaction({ walletId, type, amount, category, date, note }) {
  if (!_currentUserId) return { error: "Not authenticated." };

  const wallet = _wallets.find(w => w.id === walletId);
  if (!wallet) return { error: "Wallet is required." };

  const numericAmount = parseNumber(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0)
    return { error: "Amount must be a positive number." };

  const trimmedCategory = (category || "").trim();
  if (!trimmedCategory) return { error: "Category is required." };

  const dateISO = date || todayISO();
  const txType  = type === "income" ? "income" : "expense";

  if (txType === "expense" && wallet.balance < numericAmount)
    return { error: `Expense exceeds wallet balance (${formatCurrency(wallet.balance)}).` };

  const { data, error } = await sbAddTransaction(
    _currentUserId,
    trimmedCategory,   // title  = category (no separate title field)
    numericAmount,
    trimmedCategory,
    txType,
    dateISO
  );

  if (error) return { error: `Database error: ${error.message}` };

  if (txType === "income")  wallet.balance += numericAmount;
  if (txType === "expense") wallet.balance -= numericAmount;
  saveWallets(_wallets);

  const tx = normalizeTx({ ...data, walletId, note: (note || "").trim() });
  _txCache.unshift(tx);
  return { transaction: deepClone(tx), wallet: deepClone(wallet) };
}

export async function deleteTransaction(id) {
  const tx = _txCache.find(t => t.id === id);
  if (!tx) return { error: "Transaction not found." };

  const { error } = await sbDeleteTransaction(id);
  if (error) return { error: `Database error: ${error.message}` };

  const wallet = _wallets.find(w => w.id === tx.walletId);
  if (wallet) {
    if (tx.type === "income")  wallet.balance -= tx.amount;
    if (tx.type === "expense") wallet.balance += tx.amount;
    saveWallets(_wallets);
  }
  _txCache = _txCache.filter(t => t.id !== id);
  return { success: true };
}

export async function updateTransaction(id, { amount, category, date, note, type }) {
  const tx = _txCache.find(t => t.id === id);
  if (!tx) return { error: "Transaction not found." };

  const wallet = _wallets.find(w => w.id === tx.walletId);
  if (!wallet) return { error: "Associated wallet not found." };

  const newAmount = parseNumber(amount);
  if (!Number.isFinite(newAmount) || newAmount <= 0)
    return { error: "Amount must be a positive number." };

  const trimmedCategory = (category || "").trim();
  if (!trimmedCategory) return { error: "Category is required." };

  const newType = type === "income" ? "income" : "expense";

  // Temporarily reverse old balance to check headroom
  if (tx.type === "income")  wallet.balance -= tx.amount;
  if (tx.type === "expense") wallet.balance += tx.amount;

  if (newType === "expense" && wallet.balance < newAmount) {
    if (tx.type === "income")  wallet.balance += tx.amount;
    if (tx.type === "expense") wallet.balance -= tx.amount;
    return { error: "Expense exceeds wallet balance." };
  }

  const updatedFields = {
    title:    trimmedCategory,
    amount:   newAmount,
    category: trimmedCategory,
    type:     newType,
    date:     date || tx.date,
    note:     (note || "").trim(),
  };

  const { data, error } = await sbUpdateTransaction(id, updatedFields);
  if (error) {
    if (tx.type === "income")  wallet.balance += tx.amount;
    if (tx.type === "expense") wallet.balance -= tx.amount;
    return { error: `Database error: ${error.message}` };
  }

  if (newType === "income")  wallet.balance += newAmount;
  if (newType === "expense") wallet.balance -= newAmount;
  saveWallets(_wallets);

  Object.assign(tx, normalizeTx({ ...data, walletId: tx.walletId }));
  return { transaction: deepClone(tx), wallet: deepClone(wallet) };
}

// ── Analytics ─────────────────────────────────────────────────

export function computeAnalytics() {
  const totalBalance = _wallets.reduce((s, w) => s + w.balance, 0);
  const walletCount  = _wallets.length;
  const avgBalance   = walletCount ? totalBalance / walletCount : 0;

  const byType = _wallets.reduce(
    (acc, w) => { acc[w.type] = (acc[w.type] || 0) + w.balance; return acc; },
    { bank: 0, cash: 0, crypto: 0, other: 0 }
  );

  let totalIncome = 0, totalExpenses = 0;
  const byCategory = {}, byWalletSpending = {}, byMonth = {};

  for (const tx of _txCache) {
    const mk = monthKeyFromISO(tx.date);
    if (!byMonth[mk]) byMonth[mk] = { income: 0, expense: 0 };

    if (tx.type === "income") {
      totalIncome        += tx.amount;
      byMonth[mk].income += tx.amount;
    } else {
      totalExpenses       += tx.amount;
      byMonth[mk].expense += tx.amount;

      const ck = tx.category.toLowerCase();
      byCategory[ck] = (byCategory[ck] || 0) + tx.amount;

      const wn = (_wallets.find(w => w.id === tx.walletId) || {}).name || "Unknown";
      byWalletSpending[wn] = (byWalletSpending[wn] || 0) + tx.amount;
    }
  }

  return {
    totalBalance, walletCount, avgBalance, byType,
    totalIncome, totalExpenses, net: totalIncome - totalExpenses,
    byCategory, byWalletSpending, byMonth,
  };
}
