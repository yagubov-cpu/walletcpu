// supabase.js — Wallet App Database Helper
// Browser-native ES module — no build tools required.
// Uses the Supabase JS v2 CDN ESM bundle.

import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

// ── Credentials ───────────────────────────────────────────────
const supabaseUrl = "https://qlkgaczxgxxcwjagjauy.supabase.co";
const supabaseKey = "sb_publishable_sGti8tCmTX6npP35rflVdg_LAjI4Wsb";

// ── Client ────────────────────────────────────────────────────
export const supabase = createClient(supabaseUrl, supabaseKey);

const TABLE = "transactions";

// ════════════════════════════════════════════════════════════════
//  AUTH HELPERS
// ════════════════════════════════════════════════════════════════

/**
 * Get the current session (null if not logged in).
 * @returns {{ session: object|null, error: object|null }}
 */
export async function getSession() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return { session: data.session, error: null };
  } catch (error) {
    console.error("[getSession]", error.message);
    return { session: null, error };
  }
}

/**
 * Sign up a new user with email + password.
 * @param {string} email
 * @param {string} password
 * @returns {{ user: object|null, error: object|null }}
 */
export async function signUp(email, password) {
  try {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    return { user: data.user, error: null };
  } catch (error) {
    console.error("[signUp]", error.message);
    return { user: null, error };
  }
}

/**
 * Sign in an existing user with email + password.
 * @param {string} email
 * @param {string} password
 * @returns {{ user: object|null, session: object|null, error: object|null }}
 */
export async function signIn(email, password) {
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return { user: data.user, session: data.session, error: null };
  } catch (error) {
    console.error("[signIn]", error.message);
    return { user: null, session: null, error };
  }
}

/**
 * Sign out the current user.
 * @returns {{ error: object|null }}
 */
export async function signOut() {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return { error: null };
  } catch (error) {
    console.error("[signOut]", error.message);
    return { error };
  }
}

/**
 * Subscribe to auth state changes (SIGNED_IN / SIGNED_OUT events).
 * @param {(event: string, session: object|null) => void} callback
 * @returns Supabase subscription object
 */
export function onAuthStateChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription;
}

// ════════════════════════════════════════════════════════════════
//  TRANSACTION HELPERS  (all scoped to userId)
// ════════════════════════════════════════════════════════════════

/**
 * Fetch all transactions for a specific user, ordered newest first.
 * @param {string} userId
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
  } catch (error) {
    console.error("[getTransactions]", error.message);
    return { data: null, error };
  }
}

/**
 * Insert a new transaction row for the given user.
 * @param {string} userId
 * @param {string} title
 * @param {number} amount
 * @param {string} category
 * @param {"income"|"expense"} type
 * @param {string} date  — ISO date string, e.g. "2025-03-11"
 */
export async function addTransaction(userId, title, amount, category, type, date) {
  try {
    const { data, error } = await supabase
      .from(TABLE)
      .insert([{ user_id: userId, title, amount, category, type, date }])
      .select()
      .single();

    if (error) throw error;
    return { data, error: null };
  } catch (error) {
    console.error("[addTransaction]", error.message);
    return { data: null, error };
  }
}

/**
 * Delete a transaction by id.
 * @param {string|number} id
 */
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
  } catch (error) {
    console.error("[deleteTransaction]", error.message);
    return { data: null, error };
  }
}

/**
 * Update an existing transaction by id.
 * @param {string|number} id
 * @param {object} updatedData
 */
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
  } catch (error) {
    console.error("[updateTransaction]", error.message);
    return { data: null, error };
  }
}
