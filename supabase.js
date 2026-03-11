// supabase.js — Wallet App · Auth + Database helpers
// Browser-native ES module, no build tools required.
// Uses the Supabase JS v2 CDN ESM bundle.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ── Client (ONE shared instance for the whole page) ───────────
const supabaseUrl = "https://qlkgaczxgxxcwjagjauy.supabase.co";
const supabaseKey = "sb_publishable_sGti8tCmTX6npP35rflVdg_LAjI4Wsb";

export const supabase = createClient(supabaseUrl, supabaseKey);

const TABLE = "transactions";

// ════════════════════════════════════════════════════════════════
//  AUTH HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Read the persisted session from Supabase's local-storage cache.
 * ✅ Use this for the initial auth-gate check on page load.
 * ✅ No network request — never produces false "not logged in" results.
 * ❌ Do NOT use supabase.auth.getUser() for auth-gating — it always
 *    hits the network and can fail transiently.
 */
export async function getSession() {
  const { data, error } = await supabase.auth.getSession();
  return { session: data?.session ?? null, error: error ?? null };
}

/** Sign in with email + password. */
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  return { user: data?.user ?? null, session: data?.session ?? null, error: error ?? null };
}

/** Create a new account. */
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  return { user: data?.user ?? null, error: error ?? null };
}

/** Sign out and clear the local session. */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  return { error: error ?? null };
}

/**
 * Subscribe to auth state changes.
 *
 * CRITICAL — Supabase v2 event model:
 *   "INITIAL_SESSION"  — fires immediately after registration with the
 *                        restored session (or null if none).
 *   "SIGNED_IN"        — fires on explicit login.
 *   "SIGNED_OUT"       — fires on explicit logout or session expiry.
 *   "TOKEN_REFRESHED"  — silent renewal; no UI action needed.
 *
 * Returns { unsubscribe } so callers can clean up if needed.
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return { unsubscribe: () => data.subscription.unsubscribe() };
}

// ════════════════════════════════════════════════════════════════
//  TRANSACTION HELPERS  (all scoped by user_id)
// ════════════════════════════════════════════════════════════════

/**
 * Fetch all transactions for userId, newest first.
 * Explicit .eq("user_id") works alongside RLS — both enforce ownership.
 */
export async function getTransactions(userId) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: false });
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error("[getTransactions]", err.message);
    return { data: null, error: err };
  }
}

/** Insert a new transaction row stamped with the owner's user_id. */
export async function addTransaction(userId, title, amount, category, type, date) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .insert([{ user_id: userId, title, amount, category, type, date }])
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error("[addTransaction]", err.message);
    return { data: null, error: err };
  }
}

/** Delete a transaction by id. RLS enforces ownership server-side. */
export async function deleteTransaction(id) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .delete()
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error("[deleteTransaction]", err.message);
    return { data: null, error: err };
  }
}

/** Update a transaction by id. RLS enforces ownership server-side. */
export async function updateTransaction(id, updatedData) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .update(updatedData)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return { data, error: null };
  } catch (err) {
    console.error("[updateTransaction]", err.message);
    return { data: null, error: err };
  }
}
