// services.js — Supabase-backed data layer
// Replaces the localStorage implementation with real DB calls.
// All exported function signatures remain IDENTICAL so components.js
// needs zero changes.

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

// ── Theme (still local — no DB column for it) ─────────────────
const PREF_KEY = "wallet-dashboard-prefs-v1";

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    return raw ? JSON.parse(raw) : { theme: "dark" };
  } catch {
    return { theme: "dark" };
  }
}

function savePrefs(prefs) {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
}

export function getTheme() {
  return loadPrefs().theme === "light" ? "light" : "dark";
}

export function setTheme(theme) {
  const prefs = loadPrefs();
  prefs.theme = theme === "light" ? "light" : "dark";
  savePrefs(prefs);
}

// ── In-memory transaction cache ───────────────────────────────
// Supabase calls are async; we keep a local cache so all the
// synchronous helpers (listTransactions, computeAnalytics…)
// that components.js already calls can still work without awaiting.
let _txCache = [];   // array of transaction objects from Supabase

// Wallets remain local-only (no wallets table in Supabase).
const WALLET_KEY = "wallet-dashboard-wallets-v1";

function loadWallets() {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    return Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveWallets(wallets) {
  try { localStorage.setItem(WALLET_KEY, JSON.stringify(wallets)); } catch {}
}

let _wallets = loadWallets();

// ── Bootstrap: load all transactions from Supabase ────────────
/**
 * Must be called once at app startup (in initApp) before anything
 * else touches transactions. Returns { error } on failure.
 */
export async function loadAllTransactions() {
  const { data, error } = await sbGetTransactions();
  if (error) {
    console.error("[services] Failed to load transactions:", error.message);
    return { error };
  }
  // Supabase columns: id, title, amount, category, type, date
  // Map to the shape the rest of the app expects
  _txCache = (data || []).map(normalizeTx);
  return { error: null };
}

/** Map Supabase row → internal transaction shape */
function normalizeTx(row) {
  return {
    id:       String(row.id),
    walletId: row.walletId ?? row.wallet_id ?? null,
    title:    row.title    ?? "",
    amount:   Number(row.amount) || 0,
    type:     row.type     === "income" ? "income" : "expense",
    category: row.category ?? "Uncategorised",
    date:     row.date     ?? todayISO(),
    note:     row.note     ?? "",
  };
}

// ── getState (used by export) ─────────────────────────────────
export function getState() {
  return deepClone({ wallets: _wallets, transactions: _txCache });
}

// ── Wallets (localStorage only – no wallet table in Supabase) ─

export function listWallets() {
  return deepClone(_wallets);
}

export function addWallet({ name, type, startingBalance }) {
  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Wallet name is required." };

  const amount = parseNumber(startingBalance);
  if (!Number.isFinite(amount)) return { error: "Starting balance must be a number." };

  if (_wallets.find((w) => w.name.toLowerCase() === trimmedName.toLowerCase())) {
    return { error: "A wallet with this name already exists." };
  }

  const id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  const wallet = { id, name: trimmedName, type, balance: amount };
  _wallets.push(wallet);
  saveWallets(_wallets);
  return { wallet: deepClone(wallet) };
}

export function updateWallet(id, { name, type, startingBalance }) {
  const wallet = _wallets.find((w) => w.id === id);
  if (!wallet) return { error: "Wallet not found." };

  const trimmedName = name.trim();
  if (!trimmedName) return { error: "Wallet name is required." };

  const amount = parseNumber(startingBalance);
  if (!Number.isFinite(amount)) return { error: "Starting balance must be a number." };

  if (_wallets.find((w) => w.id !== id && w.name.toLowerCase() === trimmedName.toLowerCase())) {
    return { error: "Another wallet with this name already exists." };
  }

  wallet.name    = trimmedName;
  wallet.type    = type;
  wallet.balance = amount;
  saveWallets(_wallets);
  return { wallet: deepClone(wallet) };
}

export function deleteWallet(id) {
  if (_txCache.some((t) => t.walletId === id)) {
    return { error: "This wallet has transactions. Delete or reassign those first." };
  }
  const before = _wallets.length;
  _wallets = _wallets.filter((w) => w.id !== id);
  if (_wallets.length === before) return { error: "Wallet not found." };
  saveWallets(_wallets);
  return { success: true };
}

export function findWallet(id) {
  return deepClone(_wallets.find((w) => w.id === id) || null);
}

// ── Transactions ──────────────────────────────────────────────

export function listTransactions() {
  // Return cache copy so callers get the same snapshot shape as before
  return deepClone(_txCache);
}

/**
 * createTransaction — async, writes to Supabase then updates cache.
 * Returns { transaction, wallet } on success or { error } on failure.
 */
export async function createTransaction({ walletId, type, amount, category, date, note }) {
  const wallet = _wallets.find((w) => w.id === walletId);
  if (!wallet) return { error: "Wallet is required." };

  const numericAmount = parseNumber(amount);
  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { error: "Amount must be a positive number." };
  }

  const trimmedCategory = (category || "").trim();
  if (!trimmedCategory) return { error: "Category is required." };

  const dateISO = date || todayISO();

  if (type === "expense" && wallet.balance < numericAmount) {
    return { error: `Expense exceeds wallet balance (${formatCurrency(wallet.balance)}).` };
  }

  // Write to Supabase
  // The supabase helper signature is: addTransaction(title, amount, category, type, date)
  // We use category as the title since the old schema had no title field.
  const title = trimmedCategory;
  const { data, error } = await sbAddTransaction(title, numericAmount, trimmedCategory, type === "income" ? "income" : "expense", dateISO);

  if (error) return { error: `Database error: ${error.message}` };

  // Update wallet balance locally
  if (type === "income")  wallet.balance += numericAmount;
  if (type === "expense") wallet.balance -= numericAmount;
  saveWallets(_wallets);

  // Insert into cache (prepend so it shows newest-first)
  const tx = normalizeTx({ ...data, walletId, note: (note || "").trim() });
  _txCache.unshift(tx);

  return { transaction: deepClone(tx), wallet: deepClone(wallet) };
}

/**
 * deleteTransaction — async, removes from Supabase then updates cache.
 */
export async function deleteTransaction(id) {
  const tx = _txCache.find((t) => t.id === id);
  if (!tx) return { error: "Transaction not found." };

  const { error } = await sbDeleteTransaction(id);
  if (error) return { error: `Database error: ${error.message}` };

  // Reverse wallet balance effect
  const wallet = _wallets.find((w) => w.id === tx.walletId);
  if (wallet) {
    if (tx.type === "income")  wallet.balance -= tx.amount;
    if (tx.type === "expense") wallet.balance += tx.amount;
    saveWallets(_wallets);
  }

  _txCache = _txCache.filter((t) => t.id !== id);
  return { success: true };
}

/**
 * updateTransaction — async, patches Supabase row then updates cache.
 */
export async function updateTransaction(id, { amount, category, date, note, type }) {
  const tx = _txCache.find((t) => t.id === id);
  if (!tx) return { error: "Transaction not found." };

  const wallet = _wallets.find((w) => w.id === tx.walletId);
  if (!wallet) return { error: "Associated wallet not found." };

  const newAmount = parseNumber(amount);
  if (!Number.isFinite(newAmount) || newAmount <= 0) {
    return { error: "Amount must be a positive number." };
  }

  const trimmedCategory = (category || "").trim();
  if (!trimmedCategory) return { error: "Category is required." };

  const newType = type === "income" ? "income" : "expense";

  // Temporarily reverse old balance effect to check headroom
  if (tx.type === "income")  wallet.balance -= tx.amount;
  if (tx.type === "expense") wallet.balance += tx.amount;

  if (newType === "expense" && wallet.balance < newAmount) {
    // Restore before returning error
    if (tx.type === "income")  wallet.balance += tx.amount;
    if (tx.type === "expense") wallet.balance -= tx.amount;
    return { error: "Expense exceeds wallet balance." };
  }

  // Write to Supabase
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
    // Restore balance before returning
    if (tx.type === "income")  wallet.balance += tx.amount;
    if (tx.type === "expense") wallet.balance -= tx.amount;
    return { error: `Database error: ${error.message}` };
  }

  // Apply new balance effect
  if (newType === "income")  wallet.balance += newAmount;
  if (newType === "expense") wallet.balance -= newAmount;
  saveWallets(_wallets);

  // Patch cache entry in-place
  Object.assign(tx, normalizeTx({ ...data, walletId: tx.walletId }));

  return { transaction: deepClone(tx), wallet: deepClone(wallet) };
}

// ── Analytics (pure computation from cache — unchanged) ───────

export function computeAnalytics() {
  const wallets      = _wallets;
  const transactions = _txCache;

  const totalBalance = wallets.reduce((sum, w) => sum + w.balance, 0);
  const walletCount  = wallets.length;
  const avgBalance   = walletCount ? totalBalance / walletCount : 0;

  const byType = wallets.reduce(
    (acc, w) => { acc[w.type] = (acc[w.type] || 0) + w.balance; return acc; },
    { bank: 0, cash: 0, crypto: 0, other: 0 }
  );

  let totalIncome = 0, totalExpenses = 0;
  const byCategory = {}, byWalletSpending = {}, byMonth = {};

  for (const tx of transactions) {
    const monthKey = monthKeyFromISO(tx.date);
    if (!byMonth[monthKey]) byMonth[monthKey] = { income: 0, expense: 0 };

    if (tx.type === "income") {
      totalIncome += tx.amount;
      byMonth[monthKey].income += tx.amount;
    } else if (tx.type === "expense") {
      totalExpenses += tx.amount;
      byMonth[monthKey].expense += tx.amount;

      const catKey = tx.category.toLowerCase();
      byCategory[catKey] = (byCategory[catKey] || 0) + tx.amount;

      const wallet = _wallets.find((w) => w.id === tx.walletId);
      const walletName = wallet ? wallet.name : "Unknown";
      byWalletSpending[walletName] = (byWalletSpending[walletName] || 0) + tx.amount;
    }
  }

  return {
    totalBalance, walletCount, avgBalance, byType,
    totalIncome, totalExpenses, net: totalIncome - totalExpenses,
    byCategory, byWalletSpending, byMonth,
  };
}
