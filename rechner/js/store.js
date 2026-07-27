/* ============================================================
   Budget Rechner — Datenspeicher (localStorage)
   ============================================================ */

const STORAGE_KEY = 'budget-rechner-v1';

// Durchschnittliche Tage je Intervall (365.25 Tage / Jahr).
export const INTERVAL_DAYS = {
  daily: 1,
  weekly: 7,
  monthly: 365.25 / 12,
  yearly: 365.25,
};

export const INTERVAL_LABEL = {
  daily: 'Täglich',
  weekly: 'Wöchentlich',
  monthly: 'Monatlich',
  yearly: 'Jährlich',
};

export const PERIOD_DAYS = {
  weekly: 7,
  monthly: 365.25 / 12,
  yearly: 365.25,
};

export const PERIOD_LABEL = {
  weekly: 'Woche',
  monthly: 'Monat',
  yearly: 'Jahr',
};

let state = { accounts: [] };

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.accounts)) {
        state = parsed;
      }
    }
  } catch (err) {
    console.warn('Konnte gespeicherte Daten nicht lesen:', err);
    state = { accounts: [] };
  }
  return state;
}

export function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.warn('Konnte Daten nicht speichern:', err);
  }
}

/* ---- Konten ---- */

export function getAccounts() {
  return state.accounts;
}

export function getAccount(id) {
  return state.accounts.find((a) => a.id === id) || null;
}

export function addAccount(name, description) {
  const account = {
    id: uid(),
    name: (name || '').trim() || 'Neues Konto',
    description: (description || '').trim(),
    payments: [],
  };
  state.accounts.push(account);
  save();
  return account;
}

export function removeAccount(id) {
  state.accounts = state.accounts.filter((a) => a.id !== id);
  save();
}

/* ---- Zahlungen ---- */

export function addPayment(accountId, { name, amount, interval }) {
  const account = getAccount(accountId);
  if (!account) return null;
  const payment = {
    id: uid(),
    name: (name || '').trim() || 'Zahlung',
    amount: Number(amount) || 0,
    interval: INTERVAL_DAYS[interval] ? interval : 'monthly',
  };
  account.payments.push(payment);
  save();
  return payment;
}

export function removePayment(accountId, paymentId) {
  const account = getAccount(accountId);
  if (!account) return;
  account.payments = account.payments.filter((p) => p.id !== paymentId);
  save();
}

/* ---- Bilanz-Berechnung ---- */

// Betrag einer Zahlung auf eine Tagesrate normiert.
function perDay(payment) {
  return payment.amount / INTERVAL_DAYS[payment.interval];
}

// Bilanz eines Kontos für einen Zeitraum (weekly | monthly | yearly).
export function accountBalance(account, period = 'monthly') {
  const days = PERIOD_DAYS[period];
  return account.payments.reduce((sum, p) => sum + perDay(p) * days, 0);
}

// Gesamtbilanz über alle Konten für einen Zeitraum.
export function totalBalance(period = 'monthly') {
  return state.accounts.reduce((sum, a) => sum + accountBalance(a, period), 0);
}

// Bilanz einer einzelnen Zahlung für einen Zeitraum.
export function paymentForPeriod(payment, period = 'monthly') {
  return perDay(payment) * PERIOD_DAYS[period];
}

export function clearAll() {
  state = { accounts: [] };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Konnte Daten nicht löschen:', err);
  }
}
