/* ============================================================
   Trade Tracker — Datenspeicher (localStorage)
   ============================================================ */

const STORAGE_KEY = 'trade-tracker-v1';

let state = { startBalance: 0, trades: [] };

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// Akzeptiert deutsche wie englische Schreibweise: "1.234,56", "1234,56", "1234.56".
export function num(value, fallback = 0) {
  if (typeof value === 'number') return isFinite(value) ? value : fallback;

  let text = String(value ?? '').replace(/[\s €]/g, '');
  if (!text) return fallback;

  const hasComma = text.includes(',');
  const hasDot = text.includes('.');

  if (hasComma && hasDot) {
    // Das hintere der beiden Zeichen trennt die Nachkommastellen.
    const decimal = text.lastIndexOf(',') > text.lastIndexOf('.') ? ',' : '.';
    const thousands = decimal === ',' ? '.' : ',';
    text = text.split(thousands).join('').replace(decimal, '.');
  } else if (hasComma) {
    // Mehrere Kommas können nur Tausendertrennung sein.
    text = /^-?\d{1,3}(,\d{3})+$/.test(text) ? text.split(',').join('') : text.replace(',', '.');
  } else if (hasDot && /^-?\d{1,3}(\.\d{3})+$/.test(text)) {
    // "7.500" ist im Deutschen keine Nachkommastelle.
    text = text.split('.').join('');
  }

  const parsed = parseFloat(text);
  return isFinite(parsed) ? parsed : fallback;
}

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && Array.isArray(parsed.trades)) {
        state = {
          startBalance: num(parsed.startBalance, 0),
          trades: parsed.trades.map(normalize),
        };
      }
    }
  } catch (err) {
    console.warn('Konnte gespeicherte Daten nicht lesen:', err);
    state = { startBalance: 0, trades: [] };
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

/* ---- Startkapital ---- */

export function getStartBalance() {
  return state.startBalance;
}

export function setStartBalance(value) {
  state.startBalance = num(value, 0);
  save();
}

/* ---- Trades ---- */

function normalize(t) {
  const startAt = String(t.startAt || '').slice(0, 16);
  const endAt = String(t.endAt || '').slice(0, 16) || startAt;
  return {
    id: t.id || uid(),
    symbol: String(t.symbol || '').trim() || 'Unbenannt',
    leverage: Math.max(num(t.leverage, 1), 0) || 1,
    startAt,
    endAt,
    entry: num(t.entry, 0),
    exit: num(t.exit, 0),
    fees: Math.abs(num(t.fees, 0)),
    note: String(t.note || '').trim(),
  };
}

export function getTrades() {
  return state.trades;
}

export function getTrade(id) {
  return state.trades.find((t) => t.id === id) || null;
}

// Neueste Schließung zuerst.
export function sortedTrades() {
  return [...state.trades].sort((a, b) => (a.endAt < b.endAt ? 1 : a.endAt > b.endAt ? -1 : 0));
}

// Älteste Schließung zuerst — Basis für Verlaufsberechnungen.
export function chronoTrades() {
  return [...state.trades].sort((a, b) => (a.endAt > b.endAt ? 1 : a.endAt < b.endAt ? -1 : 0));
}

export function addTrade(data) {
  const trade = normalize({ ...data, id: uid() });
  state.trades.push(trade);
  save();
  return trade;
}

export function updateTrade(id, data) {
  const index = state.trades.findIndex((t) => t.id === id);
  if (index === -1) return null;
  state.trades[index] = normalize({ ...data, id });
  save();
  return state.trades[index];
}

export function removeTrade(id) {
  state.trades = state.trades.filter((t) => t.id !== id);
  save();
}

/* ============================================================
   Berechnungen

   Start- und Endwert sind Euro-Beträge der Position: der Startwert
   ist das eingesetzte Kapital, der Endwert der Wert beim Schließen.
   Der Hebel dient dazu, aus der Rendite die Bewegung des Basiswerts
   zurückzurechnen.
   ============================================================ */

// Realisiertes Ergebnis eines Trades in Euro.
export function tradePl(trade) {
  return trade.exit - trade.entry - trade.fees;
}

// Rendite bezogen auf das eingesetzte Kapital.
export function tradeReturn(trade) {
  if (!trade.entry) return 0;
  return tradePl(trade) / trade.entry;
}

// Aus Rendite und Hebel abgeleitete Bewegung des Basiswerts.
export function underlyingMove(trade) {
  if (!trade.entry || !trade.leverage) return 0;
  return (trade.exit / trade.entry - 1) / trade.leverage;
}

// Haltedauer in Minuten (0, wenn keine gültigen Zeitpunkte vorliegen).
export function tradeDuration(trade) {
  const start = new Date(trade.startAt).getTime();
  const end = new Date(trade.endAt).getTime();
  if (!isFinite(start) || !isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 60000);
}

// Ein Trade zählt an dem Tag, an dem er geschlossen wurde.
export function tradeDay(trade) {
  return trade.endAt.slice(0, 10);
}

// { 'YYYY-MM-DD': Trade[] }
export function tradesByDay() {
  const map = new Map();
  for (const trade of state.trades) {
    const key = tradeDay(trade);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(trade);
  }
  for (const list of map.values()) {
    list.sort((a, b) => (a.endAt > b.endAt ? 1 : -1));
  }
  return map;
}

export function tradesOfDay(dayKey) {
  return state.trades
    .filter((t) => tradeDay(t) === dayKey)
    .sort((a, b) => (a.endAt > b.endAt ? 1 : -1));
}

export function sumPl(trades) {
  return trades.reduce((sum, t) => sum + tradePl(t), 0);
}

export function totalPl() {
  return sumPl(state.trades);
}

export function totalFees() {
  return state.trades.reduce((sum, t) => sum + t.fees, 0);
}

export function currentBalance() {
  return state.startBalance + totalPl();
}

/* ---- Kennzahlen ---- */

export function stats() {
  const trades = state.trades;
  const results = trades.map(tradePl);
  const wins = results.filter((v) => v > 0);
  const losses = results.filter((v) => v < 0);
  const grossWin = wins.reduce((a, b) => a + b, 0);
  const grossLoss = Math.abs(losses.reduce((a, b) => a + b, 0));

  return {
    count: trades.length,
    wins: wins.length,
    losses: losses.length,
    winRate: trades.length ? wins.length / trades.length : 0,
    total: results.reduce((a, b) => a + b, 0),
    average: trades.length ? results.reduce((a, b) => a + b, 0) / trades.length : 0,
    avgWin: wins.length ? grossWin / wins.length : 0,
    avgLoss: losses.length ? -grossLoss / losses.length : 0,
    best: results.length ? Math.max(...results) : 0,
    worst: results.length ? Math.min(...results) : 0,
    grossWin,
    grossLoss,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : null,
    fees: totalFees(),
  };
}

// Kontostand nach jedem geschlossenen Trade, chronologisch.
export function equityCurve() {
  let balance = state.startBalance;
  const points = [{ at: null, balance }];
  for (const trade of chronoTrades()) {
    balance += tradePl(trade);
    points.push({ at: trade.endAt, balance });
  }
  return points;
}

// Ergebnis je Kalendermonat, neueste zuerst: [{ key: 'YYYY-MM', pl, count }]
export function monthlyResults() {
  const map = new Map();
  for (const trade of state.trades) {
    const key = tradeDay(trade).slice(0, 7);
    const entry = map.get(key) || { key, pl: 0, count: 0 };
    entry.pl += tradePl(trade);
    entry.count += 1;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
}

// Ergebnis je Basiswert, bestes zuerst.
export function resultsBySymbol() {
  const map = new Map();
  for (const trade of state.trades) {
    const entry = map.get(trade.symbol) || { symbol: trade.symbol, pl: 0, count: 0, wins: 0 };
    const pl = tradePl(trade);
    entry.pl += pl;
    entry.count += 1;
    if (pl > 0) entry.wins += 1;
    map.set(trade.symbol, entry);
  }
  return [...map.values()].sort((a, b) => b.pl - a.pl);
}

// Zuletzt genutzte Basiswerte — füttert die Datalist im Formular.
export function knownSymbols() {
  const seen = [];
  for (const trade of sortedTrades()) {
    if (!seen.includes(trade.symbol)) seen.push(trade.symbol);
  }
  return seen.slice(0, 20);
}

/* ---- Daten verwalten ---- */

export function exportData() {
  return JSON.stringify({ version: 1, ...state }, null, 2);
}

export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.trades)) throw new Error('Keine Trades in der Datei gefunden.');
  state = {
    startBalance: num(parsed.startBalance, 0),
    trades: parsed.trades.map(normalize),
  };
  save();
  return state.trades.length;
}

export function clearAll() {
  state = { startBalance: 0, trades: [] };
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.warn('Konnte Daten nicht löschen:', err);
  }
}
