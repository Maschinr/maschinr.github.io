/* ============================================================
   Trade Tracker — App-Logik, Router & Ansichten
   ============================================================ */

import {
  load,
  num,
  getTrade,
  sortedTrades,
  addTrade,
  updateTrade,
  removeTrade,
  tradePl,
  tradeReturn,
  underlyingMove,
  tradeDuration,
  tradeDay,
  tradesByDay,
  tradesOfDay,
  sumPl,
  totalPl,
  currentBalance,
  getStartBalance,
  setStartBalance,
  getTargetBalance,
  setTargetBalance,
  stats,
  projection,
  targetForecast,
  equityCurve,
  monthlyResults,
  resultsBySymbol,
  knownSymbols,
  getTrades,
  exportData,
  importData,
  clearAll,
} from './store.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const euro0 = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const euroCompact = new Intl.NumberFormat('de-DE', {
  style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1,
});
const dec = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

// Formatter mit fester Nachkommastellenzahl, nach Bedarf angelegt.
const fixedFormatters = new Map();
function fixed(value, digits) {
  if (!fixedFormatters.has(digits)) {
    fixedFormatters.set(digits, new Intl.NumberFormat('de-DE', {
      minimumFractionDigits: digits, maximumFractionDigits: digits,
    }));
  }
  return fixedFormatters.get(digits).format(value);
}

// Zahl für ein Eingabefeld — mit Komma, wie sie eingetippt wird.
function inputVal(value) {
  if (value === '' || value === null || value === undefined) return '';
  return String(value).replace('.', ',');
}

function fmt(value) {
  return euro.format(value);
}

// Mit Vorzeichen — für Ergebnisse.
function fmtSigned(value) {
  const s = fmt(Math.abs(value));
  if (value > 0.0049) return `+${s}`;
  if (value < -0.0049) return `−${s}`;
  return s;
}

// Sehr kurz, für die Kalenderzellen — höchstens fünf Zeichen.
function fmtCompact(value) {
  const abs = Math.abs(value);
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  if (abs >= 1e6) return `${sign}${dec.format(Math.round(abs / 1e5) / 10)}M`;
  if (abs >= 10000) return `${sign}${Math.round(abs / 1000)}k`;
  if (abs >= 1000) return `${sign}${dec.format(Math.round(abs / 100) / 10)}k`;
  return `${sign}${Math.round(abs)}`;
}

function fmtPercent(value, digits = 1) {
  const pct = value * 100;
  const sign = pct > 0.049 ? '+' : pct < -0.049 ? '−' : '';
  return `${sign}${fixed(Math.abs(pct), digits)} %`;
}

// Wie fmtPercent, hält aber auch die absurd großen Werte einer Hochrechnung
// über einen kurzen Zeitraum lesbar.
function fmtPercentLarge(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const pct = value * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  const abs = Math.abs(pct);
  if (abs >= 1e6) return pct < 0 ? '< −1 Mio. %' : '> +1 Mio. %';
  if (abs >= 1000) return `${sign}${dec.format(Math.round(abs))} %`;
  if (abs >= 100) return `${sign}${fixed(abs, 0)} %`;
  return fmtPercent(value, 1);
}

// Zeitraum in der jeweils passenden Einheit.
function fmtSpan(days) {
  if (days < 1) return 'unter einem Tag';
  if (days < 90) {
    const d = Math.round(days);
    return `${d} ${d === 1 ? 'Tag' : 'Tagen'}`;
  }
  if (days < 2 * 365) return `${fixed(days / (365.25 / 12), 1)} Monaten`;
  return `${fixed(days / 365.25, 1)} Jahren`;
}

// Wie fmtSpan, aber im Nominativ — für eine Dauer als eigenständige Angabe.
function fmtSpanNom(days) {
  if (days === null || days === undefined || !isFinite(days)) return '—';
  if (days < 1) return 'unter 1 Tag';
  if (days < 90) {
    const d = Math.round(days);
    return `${d} ${d === 1 ? 'Tag' : 'Tage'}`;
  }
  if (days < 2 * 365) return `${fixed(days / (365.25 / 12), 1)} Monate`;
  if (days < 365.25 * 500) return `${fixed(days / 365.25, 1)} Jahre`;
  return 'über 500 Jahre';
}

function fmtDuration(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} Min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 24) return rest ? `${hours} Std ${rest} Min` : `${hours} Std`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours ? `${days} T ${restHours} Std` : `${days} T`;
}

// Vorzeichen-Klasse für Ergebnisfarben.
function toneClass(value) {
  if (value > 0.0049) return 'pos';
  if (value < -0.0049) return 'neg';
  return 'zero';
}

function h(html) {
  return html; // kleiner Marker für Template-Strings
}

function esc(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

/* ============================================================
   Datum & Zeit
   ============================================================ */

const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
  'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function pad2(n) {
  return String(n).padStart(2, '0');
}

// 'YYYY-MM-DD' aus Jahr/Monat/Tag.
function dayKey(year, month, day) {
  return `${year}-${pad2(month + 1)}-${pad2(day)}`;
}

function todayKey() {
  const d = new Date();
  return dayKey(d.getFullYear(), d.getMonth(), d.getDate());
}

// 'YYYY-MM-DDTHH:mm' für datetime-local-Felder.
function toLocalInput(date) {
  return `${dayKey(date.getFullYear(), date.getMonth(), date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function dayLabel(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return '—';
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('de-DE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

function dayLabelShort(key) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key || '')) return '—';
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return `${WEEKDAYS[(date.getDay() + 6) % 7]}, ${d}. ${MONTHS_SHORT[m - 1]} ${y}`;
}

function timeLabel(local) {
  const time = String(local || '').slice(11, 16);
  return time ? `${time} Uhr` : '—';
}

function monthLabel(key) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/* ============================================================
   Icons (Inline-SVG)
   ============================================================ */

const icons = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 20h18"/><path d="M6 20v-6M11 20V8M16 20v-9M21 20V5"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><path d="M7 11l5 5 5-5"/><path d="M4 21h16"/></svg>',
  upload: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 21h16"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M21 7H5a2 2 0 0 0 0 4h16"/><circle cx="17" cy="14" r="1.4" fill="currentColor" stroke="none"/></svg>',
};

/* ============================================================
   Router
   ============================================================ */

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  return hash.split('/').filter(Boolean);
}

function navigate(path) {
  location.hash = path;
}

function currentTab(parts) {
  if (parts[0] === 'trades' || parts[0] === 'trade') return 'trades';
  if (parts[0] === 'auswertung') return 'auswertung';
  if (parts[0] === 'mehr') return 'mehr';
  return 'kalender';
}

function render() {
  const parts = parseHash();
  let view;
  if (parts[0] === 'tag' && parts[1]) {
    view = renderDay(parts[1]);
  } else if (parts[0] === 'trade' && parts[1]) {
    view = renderTradeDetail(parts[1]);
  } else if (parts[0] === 'trades') {
    view = renderTrades();
  } else if (parts[0] === 'auswertung') {
    view = renderStats();
  } else if (parts[0] === 'mehr') {
    view = renderSettings();
  } else {
    view = renderCalendar();
  }

  app.innerHTML = view + renderTabBar(currentTab(parts));
  wireEvents();
  window.scrollTo(0, 0);
}

/* ============================================================
   Tab-Leiste mit zentralem Button
   ============================================================ */

function renderTabBar(active) {
  const tab = (id, href, label, icon) => h(`
    <a class="tab ${active === id ? 'active' : ''}" href="#/${href}">
      ${icon}<span>${label}</span>
    </a>`);
  return h(`
    <nav class="tabbar">
      ${tab('kalender', 'kalender', 'Kalender', icons.calendar)}
      ${tab('trades', 'trades', 'Trades', icons.list)}
      <span class="tab-gap"></span>
      ${tab('auswertung', 'auswertung', 'Auswertung', icons.chart)}
      ${tab('mehr', 'mehr', 'Mehr', icons.settings)}
    </nav>
    <button class="fab" data-action="new-trade" aria-label="Neuen Trade anlegen" title="Neuen Trade anlegen">
      ${icons.plus}
    </button>`);
}

/* ============================================================
   Ansicht: Kalender
   ============================================================ */

const today = new Date();
let calYear = today.getFullYear();
let calMonth = today.getMonth();

function renderCalendar() {
  const byDay = tradesByDay();
  const prefix = `${calYear}-${pad2(calMonth + 1)}-`;

  const monthTrades = [];
  for (const [key, list] of byDay) {
    if (key.startsWith(prefix)) monthTrades.push(...list);
  }
  const monthPl = sumPl(monthTrades);
  const monthWins = monthTrades.filter((t) => tradePl(t) > 0).length;

  const firstWeekday = (new Date(calYear, calMonth, 1).getDay() + 6) % 7; // Mo = 0
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const now = todayKey();

  const cells = [];
  for (let i = 0; i < firstWeekday; i++) {
    cells.push('<div class="cal-cell blank"></div>');
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const key = dayKey(calYear, calMonth, day);
    const list = byDay.get(key) || [];
    const pl = sumPl(list);
    const classes = ['cal-cell'];
    if (list.length) classes.push('has-trades', toneClass(pl));
    if (key === now) classes.push('today');
    const dots = list.length
      ? `<div class="dots">${'<i></i>'.repeat(Math.min(list.length, 4))}</div>`
      : '';
    cells.push(h(`
      <div class="${classes.join(' ')}" ${list.length ? `data-open-day="${key}"` : ''}>
        <span class="day-num">${day}</span>
        ${list.length ? `<span class="day-pl">${fmtCompact(pl)}</span>` : ''}
        ${dots}
      </div>`));
  }
  while (cells.length % 7 !== 0) {
    cells.push('<div class="cal-cell blank"></div>');
  }

  const balance = currentBalance();

  return h(`
    <header class="topbar">
      <h1>Kalender</h1>
    </header>
    <main class="content">
      <div class="balance-hero ${toneClass(monthPl)}">
        <span class="label">Ergebnis ${MONTHS[calMonth]} ${calYear}</span>
        <span class="amount">${fmtSigned(monthPl)}</span>
        <span class="sub">${monthTrades.length} ${monthTrades.length === 1 ? 'Trade' : 'Trades'}${monthTrades.length ? ` · ${monthWins} im Plus` : ''}</span>
        <div class="hero-split">
          <div><span>${fmt(balance)}</span><small>Kontostand</small></div>
          <div><span class="${toneClass(totalPl())}">${fmtSigned(totalPl())}</span><small>gesamt</small></div>
        </div>
      </div>

      <div class="month-nav">
        <button class="icon-btn" data-month="-1" aria-label="Vorheriger Monat">${icons.back}</button>
        <span class="month-label">${MONTHS[calMonth]} ${calYear}</span>
        <span class="month-side">
          <button class="icon-btn" data-month="today" title="Heute" aria-label="Aktueller Monat">${icons.calendar}</button>
          <button class="icon-btn" data-month="1" aria-label="Nächster Monat">${icons.next}</button>
        </span>
      </div>

      <div>
        <div class="weekdays">${WEEKDAYS.map((d) => `<span>${d}</span>`).join('')}</div>
        <div class="calendar-grid" style="margin-top:6px">${cells.join('')}</div>
      </div>

      ${monthTrades.length === 0 ? h(`
        <div class="empty small">
          <p class="empty-text">In diesem Monat wurden keine Trades geschlossen.</p>
        </div>`) : h(`
        <div class="section-head"><h2>Tage mit Trades</h2></div>
        ${dayList(byDay, prefix)}`)}
    </main>`);
}

// Alle Tage des angezeigten Monats mit Ergebnis, neueste zuerst.
function dayList(byDay, prefix) {
  const keys = [...byDay.keys()].filter((k) => k.startsWith(prefix)).sort().reverse();
  const rows = keys.map((key) => {
    const list = byDay.get(key);
    const pl = sumPl(list);
    const wins = list.filter((t) => tradePl(t) > 0).length;
    return h(`
      <div class="card row trade-row" data-open-day="${key}">
        <div class="row-main">
          <div class="row-title">${esc(dayLabelShort(key))}</div>
          <div class="row-sub">${list.length} ${list.length === 1 ? 'Trade' : 'Trades'} · ${wins} im Plus</div>
        </div>
        <div class="row-end" style="flex-direction:row">
          <span class="pill ${toneClass(pl)}">${fmtSigned(pl)}</span>
          <span class="chevron">${icons.chevron}</span>
        </div>
      </div>`);
  });
  return h(`<div class="list">${rows.join('')}</div>`);
}

/* ============================================================
   Ansicht: Einzelner Tag
   ============================================================ */

function renderDay(key) {
  const list = tradesOfDay(key);
  const pl = sumPl(list);
  const wins = list.filter((t) => tradePl(t) > 0).length;
  const results = list.map(tradePl);
  const average = results.length ? pl / results.length : 0;
  const best = results.length ? Math.max(...results) : 0;

  return h(`
    <header class="topbar">
      <a class="icon-btn" href="#/kalender" aria-label="Zurück">${icons.back}</a>
      <div class="topbar-titles">
        <h1>${esc(dayLabelShort(key))}</h1>
        <p class="topbar-sub">${esc(dayLabel(key))}</p>
      </div>
    </header>
    <main class="content">
      <div class="balance-hero ${toneClass(pl)}">
        <span class="label">Tagesergebnis</span>
        <span class="amount">${fmtSigned(pl)}</span>
        <span class="sub">${list.length} ${list.length === 1 ? 'Trade' : 'Trades'} · ${wins} im Plus</span>
        ${list.length ? h(`
        <div class="hero-split">
          <div><span class="${toneClass(average)}">${fmtSigned(average)}</span><small>Ø je Trade</small></div>
          <div><span class="${toneClass(best)}">${fmtSigned(best)}</span><small>bester Trade</small></div>
        </div>`) : ''}
      </div>
      ${list.length === 0
        ? h(`<div class="empty small"><p class="empty-text">Keine Trades an diesem Tag.</p></div>`)
        : h(`<div class="list">${list.map(tradeRow).join('')}</div>`)}
    </main>`);
}

/* ============================================================
   Ansicht: Alle Trades
   ============================================================ */

function renderTrades() {
  const trades = sortedTrades();
  if (trades.length === 0) {
    return h(`
      <header class="topbar"><h1>Trades</h1></header>
      <main class="content">
        <div class="empty">
          <div class="empty-icon">${icons.chart}</div>
          <p class="empty-title">Noch keine Trades</p>
          <p class="empty-text">Tippe auf den Plus-Button, um deinen ersten Trade zu erfassen.</p>
        </div>
      </main>`);
  }

  // Nach Handelstag gruppieren.
  const groups = [];
  for (const trade of trades) {
    const key = tradeDay(trade);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.trades.push(trade);
    else groups.push({ key, trades: [trade] });
  }

  const body = groups.map((group) => {
    const pl = sumPl(group.trades);
    return h(`
      <div class="day-group-head">
        <span class="date">${esc(dayLabelShort(group.key))}</span>
        <span class="sum ${toneClass(pl)}">${fmtSigned(pl)}</span>
      </div>
      <div class="list">${group.trades.map(tradeRow).join('')}</div>`);
  }).join('');

  return h(`
    <header class="topbar">
      <div class="topbar-titles"><h1>Trades</h1></div>
      <span class="pill ${toneClass(totalPl())}">${fmtSigned(totalPl())}</span>
    </header>
    <main class="content">
      <div class="section-head">
        <h2>Alle Trades</h2>
        <span class="count">${trades.length}</span>
      </div>
      ${body}
    </main>`);
}

function tradeRow(trade) {
  const pl = tradePl(trade);
  const ret = tradeReturn(trade);
  return h(`
    <div class="card row trade-row" data-open-trade="${trade.id}">
      <div class="row-main">
        <div class="row-title">
          <span>${esc(trade.symbol)}</span>
          <span class="tag">${dec.format(trade.leverage)}×</span>
        </div>
        <div class="row-sub">${timeLabel(trade.startAt)} → ${timeLabel(trade.endAt)} · ${fmtDuration(tradeDuration(trade))}</div>
      </div>
      <div class="row-end">
        <span class="pill ${toneClass(pl)}">${fmtSigned(pl)}</span>
        <span class="sub-value ${toneClass(ret)}">${fmtPercent(ret)}</span>
      </div>
    </div>`);
}

/* ============================================================
   Ansicht: Trade-Detail
   ============================================================ */

function renderTradeDetail(id) {
  const trade = getTrade(id);
  if (!trade) {
    return h(`
      <header class="topbar">
        <a class="icon-btn" href="#/trades" aria-label="Zurück">${icons.back}</a>
        <h1>Trade</h1>
      </header>
      <main class="content">
        <div class="empty"><p class="empty-title">Trade nicht gefunden</p></div>
      </main>`);
  }

  const pl = tradePl(trade);
  const ret = tradeReturn(trade);
  const move = underlyingMove(trade);

  return h(`
    <header class="topbar">
      <a class="icon-btn" href="#/trades" aria-label="Zurück">${icons.back}</a>
      <div class="topbar-titles">
        <h1>${esc(trade.symbol)}</h1>
        <p class="topbar-sub">Hebel ${dec.format(trade.leverage)}× · ${esc(dayLabelShort(tradeDay(trade)))}</p>
      </div>
    </header>
    <main class="content">
      <div class="balance-hero ${toneClass(pl)}">
        <span class="label">Ergebnis</span>
        <span class="amount">${fmtSigned(pl)}</span>
        <span class="sub">${fmtPercent(ret)} auf den Einsatz</span>
        <div class="hero-split">
          <div><span>${fmt(trade.entry)}</span><small>Einsatz</small></div>
          <div><span class="${toneClass(move)}">${fmtPercent(move, 2)}</span><small>Basiswert</small></div>
        </div>
      </div>

      <div class="card detail-card">
        <div class="detail-grid">
          <div><span class="dt">Basiswert</span><span class="dd">${esc(trade.symbol)}</span></div>
          <div><span class="dt">Hebel</span><span class="dd">${dec.format(trade.leverage)}×</span></div>
          <div><span class="dt">Startwert</span><span class="dd">${fmt(trade.entry)}</span></div>
          <div><span class="dt">Endwert</span><span class="dd">${fmt(trade.exit)}</span></div>
          <div><span class="dt">Eröffnet</span><span class="dd">${esc(dayLabelShort(trade.startAt.slice(0, 10)))}, ${timeLabel(trade.startAt)}</span></div>
          <div><span class="dt">Geschlossen</span><span class="dd">${esc(dayLabelShort(trade.endAt.slice(0, 10)))}, ${timeLabel(trade.endAt)}</span></div>
          <div><span class="dt">Haltedauer</span><span class="dd">${fmtDuration(tradeDuration(trade))}</span></div>
          <div><span class="dt">Rendite</span><span class="dd ${toneClass(ret)}">${fmtPercent(ret, 2)}</span></div>
        </div>
        ${trade.note ? `<p class="muted">${esc(trade.note)}</p>` : ''}
      </div>

      <button class="btn ghost block" data-edit-trade="${trade.id}">${icons.edit}<span>Bearbeiten</span></button>
      <button class="btn danger block" data-del-trade="${trade.id}">${icons.trash}<span>Trade löschen</span></button>
    </main>`);
}

/* ============================================================
   Ansicht: Gesamtauswertung
   ============================================================ */

function renderStats() {
  const s = stats();
  const balance = currentBalance();
  const start = getStartBalance();
  const growth = start > 0 ? (balance - start) / start : 0;

  if (s.count === 0) {
    return h(`
      <header class="topbar"><h1>Auswertung</h1></header>
      <main class="content">
        <div class="balance-hero">
          <span class="label">Kontostand</span>
          <span class="amount">${fmt(balance)}</span>
          <span class="sub">Startkapital ${fmt(start)}</span>
        </div>
        <div class="empty">
          <div class="empty-icon">${icons.chart}</div>
          <p class="empty-title">Noch nichts auszuwerten</p>
          <p class="empty-text">Erfasse Trades, um Ergebnis, Trefferquote und Verlauf zu sehen.</p>
        </div>
        ${getTargetBalance() > 0 ? h(`
          <div class="section-head"><h2>Zielbetrag</h2></div>
          ${targetCard()}`) : ''}
      </main>`);
  }

  const stat = (value, label, tone = '') => h(`
    <div class="stat">
      <span class="stat-num ${tone}">${value}</span>
      <span class="stat-label">${label}</span>
    </div>`);

  return h(`
    <header class="topbar"><h1>Auswertung</h1></header>
    <main class="content">
      <div class="balance-hero ${toneClass(s.total)}">
        <span class="label">Kontostand</span>
        <span class="amount">${fmt(balance)}</span>
        <span class="sub">Startkapital ${fmt(start)}${start > 0 ? ` · ${fmtPercent(growth)}` : ''}</span>
        <div class="hero-split">
          <div><span class="${toneClass(s.total)}">${fmtSigned(s.total)}</span><small>Gewinn/Verlust</small></div>
          <div><span>${fmtPercent(s.winRate, 0).replace('+', '')}</span><small>Trefferquote</small></div>
        </div>
      </div>

      ${equityChart()}

      <div class="section-head"><h2>Hochrechnung</h2></div>
      ${projectionCard()}

      <div class="section-head"><h2>Zielbetrag</h2></div>
      ${targetCard()}

      <div class="section-head"><h2>Kennzahlen</h2></div>
      <div class="stat-grid">
        ${stat(String(s.count), s.count === 1 ? 'Trade' : 'Trades')}
        ${stat(fmtPercent(s.winRate, 0).replace('+', ''), `Trefferquote (${s.wins}/${s.count})`)}
        ${stat(fmtSigned(s.average), 'Ø je Trade', toneClass(s.average))}
        ${stat(s.profitFactor === null ? '—' : fixed(s.profitFactor, 2), 'Profit-Faktor')}
        ${stat(fmtSigned(s.avgWin), 'Ø Gewinn', 'pos')}
        ${stat(fmtSigned(s.avgLoss), 'Ø Verlust', 'neg')}
        ${stat(fmtSigned(s.best), 'Bester Trade', 'pos')}
        ${stat(fmtSigned(s.worst), 'Schlechtester', 'neg')}
      </div>

      <div class="section-head"><h2>Je Basiswert</h2></div>
      <div class="list">${symbolBars()}</div>

      <div class="section-head"><h2>Je Monat</h2></div>
      <div class="list">${monthBars()}</div>
    </main>`);
}

// Bisherige Rendite auf ein Jahr hochgerechnet.
function projectionCard() {
  const p = projection();

  if (!p.ready) {
    return h(`
      <div class="card info-card">
        <p class="muted">Für die Hochrechnung wird ein Startkapital größer als 0 € benötigt — hinterlege es unter „Mehr“.</p>
      </div>`);
  }

  // Bei sehr kurzen Zeiträumen wird die Fortschreibung astronomisch — gekappt,
  // damit die Karte lesbar bleibt.
  const money = (value) => {
    if (!isFinite(value)) return '—';
    const abs = Math.abs(value);
    if (abs >= 1e12) return value < 0 ? '< −1 Bio. €' : '> 1 Bio. €';
    if (abs >= 1e6) return euroCompact.format(value);
    return fmt(value);
  };

  return h(`
    <div class="balance-hero ${toneClass(p.cagr)}">
      <span class="label">Rendite p. a.</span>
      <span class="amount">${fmtPercentLarge(p.cagr)}</span>
      <span class="sub">${fmtPercent(p.growth)} in ${fmtSpan(p.days)} · mit Zinseszins hochgerechnet</span>
      <div class="hero-split">
        <div><span class="${toneClass(p.linear)}">${fmtPercentLarge(p.linear)}</span><small>p. a. ohne Zinseszins</small></div>
        <div><span class="${toneClass(p.monthly)}">${fmtPercentLarge(p.monthly)}</span><small>Ø je Monat</small></div>
      </div>
      <div class="hero-split">
        <div><span>${money(p.balance)}</span><small>Kontostand heute</small></div>
        <div><span class="${toneClass(p.projected - p.balance)}">${money(p.projected)}</span><small>in 12 Monaten</small></div>
      </div>
      <p class="projection-note">
        Fortschreibung der bisherigen Entwicklung, keine Prognose.${p.short
          ? ' Der Zeitraum ist noch kurz — der Wert schwankt entsprechend stark.'
          : ''}
      </p>
    </div>`);
}

// Restdauer bis zum Zielbetrag — bei gleichbleibender Rendite.
function targetCard() {
  const t = targetForecast();

  if (t.status === 'none') {
    return h(`
      <div class="card info-card">
        <p class="muted">Noch kein Zielbetrag hinterlegt. Sobald du einen festlegst, steht hier, wie lange es mit der bisherigen Rendite bis dahin dauert.</p>
        <button class="btn primary block" data-action="set-target">${icons.target}<span>Zielbetrag festlegen</span></button>
      </div>`);
  }

  const head = (amount, sub) => h(`
    <span class="label">Zielbetrag ${fmt(t.target)}</span>
    <span class="amount">${amount}</span>
    <span class="sub">${sub}</span>`);

  if (t.status === 'reached') {
    return h(`
      <div class="balance-hero pos">
        ${head('Ziel erreicht', `Kontostand ${fmt(t.balance)} — ${fmtSigned(t.balance - t.target)} über dem Ziel.`)}
        <div class="bar-track" style="margin-top:14px"><span class="bar-fill pos" style="width:100%"></span></div>
      </div>`);
  }

  const progressBar = h(`
    <div class="bar-track" style="margin-top:14px">
      <span class="bar-fill pos" style="width:${(t.progress * 100).toFixed(1)}%"></span>
    </div>`);

  if (t.status === 'nodata') {
    return h(`
      <div class="balance-hero">
        ${head('—', `Noch ${fmt(t.remaining)} bis zum Ziel.`)}
        ${progressBar}
        <p class="projection-note">Für die Restdauer werden ein Startkapital größer als 0 € und mindestens ein Trade benötigt.</p>
      </div>`);
  }

  if (t.status === 'stalled') {
    return h(`
      <div class="balance-hero neg">
        ${head('nicht in Sicht', `Noch ${fmt(t.remaining)} bis zum Ziel.`)}
        ${progressBar}
        <p class="projection-note">Die bisherige Entwicklung zeigt kein Wachstum — so fortgeschrieben wird der Zielbetrag nie erreicht.</p>
      </div>`);
  }

  const days = t.days ?? t.daysLinear;
  const dateLabel = t.date
    ? t.date.toLocaleDateString('de-DE', days < 90
      ? { day: 'numeric', month: 'long', year: 'numeric' }
      : { month: 'long', year: 'numeric' })
    : null;

  const dateSub = dateLabel
    ? `voraussichtlich ${days < 90 ? 'am' : 'im'} ${esc(dateLabel)} erreicht`
    : 'Der Termin liegt außerhalb des darstellbaren Zeitraums.';

  return h(`
    <div class="balance-hero">
      ${head(`noch ${fmtSpanNom(days)}`, dateSub)}
      ${progressBar}
      <div class="hero-split">
        <div><span>${fmt(t.remaining)}</span><small>noch nötig</small></div>
        <div><span>${fmtPercent(t.progress, 0).replace('+', '')}</span><small>vom Weg geschafft</small></div>
      </div>
      <div class="hero-split">
        <div><span class="${toneClass(t.monthlyRate)}">${fmtPercentLarge(t.monthlyRate)}</span><small>Ø je Monat</small></div>
        <div><span>${fmtSpanNom(t.daysLinear)}</span><small>ohne Zinseszins</small></div>
      </div>
      <p class="projection-note">
        Gerechnet mit der bisherigen Rendite und Zinseszins — eine Fortschreibung, keine Prognose.${t.short
          ? ' Der getrackte Zeitraum ist noch kurz, die Restdauer schwankt entsprechend stark.'
          : ''}
      </p>
    </div>`);
}

// Kontoverlauf nach jedem geschlossenen Trade.
function equityChart() {
  const points = equityCurve();
  if (points.length < 3) {
    return h(`
      <div class="card chart-card">
        <h2>Kontoverlauf</h2>
        <p class="muted" style="padding:6px 4px 12px">Ab dem zweiten Trade wird hier der Verlauf gezeichnet.</p>
      </div>`);
  }

  const values = points.map((p) => p.balance);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || Math.abs(max) || 1;
  const W = 320;
  const H = 150;
  const pad = 10;

  const x = (i) => pad + (i / (points.length - 1)) * (W - 2 * pad);
  const y = (v) => H - pad - ((v - min) / range) * (H - 2 * pad);

  const line = points.map((p, i) => `${x(i).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  const area = `${x(0).toFixed(1)},${(H - pad).toFixed(1)} ${line} ${x(points.length - 1).toFixed(1)},${(H - pad).toFixed(1)}`;

  const start = points[0].balance;
  const baseY = y(start).toFixed(1);
  const last = points[points.length - 1].balance;

  return h(`
    <div class="card chart-card">
      <h2>Kontoverlauf</h2>
      <svg class="equity-chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img"
           aria-label="Verlauf des Kontostands über alle Trades">
        <polygon class="area" points="${area}" />
        <line class="base" x1="${pad}" y1="${baseY}" x2="${W - pad}" y2="${baseY}" vector-effect="non-scaling-stroke" />
        <polyline class="line" points="${line}" vector-effect="non-scaling-stroke" />
      </svg>
      <div class="chart-legend">
        <span>Start ${euro0.format(start)}</span>
        <span>Tief ${euro0.format(min)} · Hoch ${euro0.format(max)}</span>
        <span>Jetzt ${euro0.format(last)}</span>
      </div>
    </div>`);
}

function symbolBars() {
  const rows = resultsBySymbol();
  if (rows.length === 0) return '';
  const scale = Math.max(...rows.map((r) => Math.abs(r.pl))) || 1;
  return rows.map((r) => h(`
    <div class="card bar-row">
      <div class="bar-head">
        <span class="bar-name">${esc(r.symbol)}</span>
        <span class="bar-value ${toneClass(r.pl)}">${fmtSigned(r.pl)}</span>
      </div>
      <div class="bar-track">
        <span class="bar-fill ${toneClass(r.pl)}" style="width:${((Math.abs(r.pl) / scale) * 100).toFixed(1)}%"></span>
      </div>
      <span class="bar-sub">${r.count} ${r.count === 1 ? 'Trade' : 'Trades'} · ${r.wins} im Plus</span>
    </div>`)).join('');
}

function monthBars() {
  const rows = monthlyResults();
  if (rows.length === 0) return '';
  const scale = Math.max(...rows.map((r) => Math.abs(r.pl))) || 1;
  return rows.map((r) => h(`
    <div class="card bar-row">
      <div class="bar-head">
        <span class="bar-name">${esc(monthLabel(r.key))}</span>
        <span class="bar-value ${toneClass(r.pl)}">${fmtSigned(r.pl)}</span>
      </div>
      <div class="bar-track">
        <span class="bar-fill ${toneClass(r.pl)}" style="width:${((Math.abs(r.pl) / scale) * 100).toFixed(1)}%"></span>
      </div>
      <span class="bar-sub">${r.count} ${r.count === 1 ? 'Trade' : 'Trades'}</span>
    </div>`)).join('');
}

/* ============================================================
   Ansicht: Mehr / Einstellungen
   ============================================================ */

function renderSettings() {
  const start = getStartBalance();
  const balance = currentBalance();
  const target = getTargetBalance();
  const count = getTrades().length;

  return h(`
    <header class="topbar"><h1>Mehr</h1></header>
    <main class="content">
      <div class="card info-card">
        <h2>Startkapital</h2>
        <p class="muted">Basis für den Kontostand. Der aktuelle Stand ergibt sich aus Startkapital plus allen realisierten Ergebnissen.</p>
        <div class="hero-split" style="margin-top:0;border-top:none;padding-top:0">
          <div><span>${fmt(start)}</span><small>Startkapital</small></div>
          <div><span class="${toneClass(balance - start)}">${fmt(balance)}</span><small>aktueller Stand</small></div>
        </div>
        <button class="btn primary block" data-action="set-balance">${icons.wallet}<span>Startkapital ändern</span></button>
      </div>

      <div class="card info-card">
        <h2>Zielbetrag</h2>
        <p class="muted">Kontostand, den du erreichen möchtest. Unter „Auswertung“ steht dann, wie lange es mit der bisherigen Rendite noch bis dahin dauert.</p>
        <div class="hero-split" style="margin-top:0;border-top:none;padding-top:0">
          <div><span>${target > 0 ? fmt(target) : '—'}</span><small>Zielbetrag</small></div>
          <div><span>${target > balance ? fmt(target - balance) : '—'}</span><small>noch nötig</small></div>
        </div>
        <button class="btn primary block" data-action="set-target">${icons.target}<span>${target > 0 ? 'Zielbetrag ändern' : 'Zielbetrag festlegen'}</span></button>
      </div>

      <div class="card info-card">
        <h2>Daten</h2>
        <p class="muted">Alle Daten werden ausschließlich lokal in diesem Browser gespeichert (localStorage). Es werden keine Daten an einen Server gesendet — sichere sie bei Bedarf per Export.</p>
        <div class="stat-grid">
          <div class="stat"><span class="stat-num">${count}</span><span class="stat-label">${count === 1 ? 'Trade' : 'Trades'}</span></div>
          <div class="stat"><span class="stat-num ${toneClass(totalPl())}">${fmtSigned(totalPl())}</span><span class="stat-label">Gesamtergebnis</span></div>
        </div>
        <button class="btn ghost block" data-action="export">${icons.download}<span>Als JSON exportieren</span></button>
        <button class="btn ghost block" data-action="import">${icons.upload}<span>Aus JSON importieren</span></button>
        <input type="file" accept="application/json,.json" id="import-file" hidden />
      </div>

      <button class="btn danger block" data-action="clear-data">${icons.trash}<span>Alle Daten löschen</span></button>
      <p class="app-version">Trade Tracker · PWA · offline nutzbar</p>
    </main>`);
}

/* ============================================================
   Modal / Dialog
   ============================================================ */

function openModal(title, bodyHtml, onSubmit, options = {}) {
  const { submitLabel = 'Speichern', onInput = null } = options;

  modalRoot.innerHTML = h(`
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <form class="modal-body" id="modal-form">
          ${bodyHtml}
          <div class="modal-actions">
            <button type="button" class="btn ghost" data-modal-cancel>Abbrechen</button>
            <button type="submit" class="btn primary">${esc(submitLabel)}</button>
          </div>
        </form>
      </div>
    </div>`);

  const backdrop = modalRoot.querySelector('.modal-backdrop');
  const form = modalRoot.querySelector('#modal-form');
  const close = () => { modalRoot.innerHTML = ''; };

  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  modalRoot.querySelector('[data-modal-cancel]').addEventListener('click', close);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    if (onSubmit(data) !== false) close();
  });

  if (onInput) {
    const update = () => onInput(Object.fromEntries(new FormData(form).entries()), form);
    form.addEventListener('input', update);
    update();
  }

  const first = form.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
}

function confirmDialog(title, message, onConfirm, confirmLabel = 'Löschen') {
  modalRoot.innerHTML = h(`
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true">
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <div class="modal-body">
          <p class="muted">${esc(message)}</p>
          <div class="modal-actions">
            <button type="button" class="btn ghost" data-modal-cancel>Abbrechen</button>
            <button type="button" class="btn danger" data-modal-confirm>${esc(confirmLabel)}</button>
          </div>
        </div>
      </div>
    </div>`);
  const backdrop = modalRoot.querySelector('.modal-backdrop');
  const close = () => { modalRoot.innerHTML = ''; };
  backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close(); });
  modalRoot.querySelector('[data-modal-cancel]').addEventListener('click', close);
  modalRoot.querySelector('[data-modal-confirm]').addEventListener('click', () => {
    onConfirm();
    close();
  });
}

/* ============================================================
   Trade-Formular
   ============================================================ */

function tradeForm(trade) {
  const now = new Date();
  const nowLocal = toLocalInput(now);
  const v = {
    symbol: trade ? trade.symbol : '',
    leverage: trade ? trade.leverage : 1,
    startAt: trade ? trade.startAt : nowLocal,
    endAt: trade ? trade.endAt : nowLocal,
    entry: trade ? trade.entry : '',
    exit: trade ? trade.exit : '',
    note: trade ? trade.note : '',
  };

  const symbolOptions = knownSymbols()
    .map((s) => `<option value="${esc(s)}"></option>`)
    .join('');

  return h(`
    <div class="field-row">
      <label class="field" style="flex:2">
        <span>Basiswert</span>
        <input name="symbol" type="text" list="symbol-list" placeholder="z. B. DAX, BTC, Tesla"
               value="${esc(v.symbol)}" required maxlength="40" autocomplete="off" />
        <datalist id="symbol-list">${symbolOptions}</datalist>
      </label>
      <label class="field">
        <span>Hebel</span>
        <input name="leverage" type="text" inputmode="decimal" placeholder="1" value="${esc(inputVal(v.leverage))}" />
      </label>
    </div>

    <label class="field">
      <span>Start</span>
      <input name="startAt" type="datetime-local" value="${esc(v.startAt)}" required />
    </label>
    <label class="field">
      <span>Ende</span>
      <input name="endAt" type="datetime-local" value="${esc(v.endAt)}" required />
    </label>

    <div class="field">
      <div class="field-row">
        <label class="field" style="margin-bottom:0">
          <span>Startwert (€)</span>
          <input name="entry" type="text" inputmode="decimal" placeholder="0,00" value="${esc(inputVal(v.entry))}" required />
        </label>
        <label class="field" style="margin-bottom:0">
          <span>Endwert (€)</span>
          <input name="exit" type="text" inputmode="decimal" placeholder="0,00" value="${esc(inputVal(v.exit))}" required />
        </label>
      </div>
      <span class="hint">Startwert = Einsatz beim Öffnen, Endwert = Wert beim Schließen.</span>
    </div>

    <label class="field">
      <span>Notiz</span>
      <input name="note" type="text" placeholder="Optional" value="${esc(v.note)}" maxlength="140" />
    </label>

    <div class="form-preview">
      <span class="label">Ergebnis</span>
      <span class="value" data-preview>—</span>
    </div>`);
}

// Live-Vorschau des Ergebnisses im Formular.
function previewResult(data, form) {
  const target = form.querySelector('[data-preview]');
  if (!target) return;
  const entry = num(data.entry, NaN);
  const exit = num(data.exit, NaN);
  if (!isFinite(entry) || !isFinite(exit)) {
    target.textContent = '—';
    target.className = 'value';
    return;
  }
  const pl = exit - entry;
  const ret = entry ? pl / entry : 0;
  target.textContent = `${fmtSigned(pl)}  (${fmtPercent(ret)})`;
  target.className = `value ${toneClass(pl)}`;
}

function openTradeModal(trade) {
  openModal(
    trade ? 'Trade bearbeiten' : 'Neuer Trade',
    tradeForm(trade),
    (data) => {
      const symbol = String(data.symbol || '').trim();
      const entry = num(data.entry, NaN);
      const exit = num(data.exit, NaN);
      if (!symbol || !isFinite(entry) || !isFinite(exit) || !data.startAt || !data.endAt) return false;

      const payload = {
        symbol,
        leverage: num(data.leverage, 1) || 1,
        startAt: data.startAt,
        endAt: data.endAt,
        entry,
        exit,
        note: data.note,
      };

      if (trade) updateTrade(trade.id, payload);
      else addTrade(payload);
      render();
    },
    { submitLabel: trade ? 'Speichern' : 'Trade anlegen', onInput: previewResult }
  );
}

/* ============================================================
   Event-Verdrahtung
   ============================================================ */

function wireEvents() {
  app.querySelectorAll('[data-open-day]').forEach((el) => {
    el.addEventListener('click', () => navigate(`/tag/${el.getAttribute('data-open-day')}`));
  });

  app.querySelectorAll('[data-open-trade]').forEach((el) => {
    el.addEventListener('click', () => navigate(`/trade/${el.getAttribute('data-open-trade')}`));
  });

  app.querySelectorAll('[data-month]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const step = btn.getAttribute('data-month');
      if (step === 'today') {
        const now = new Date();
        calYear = now.getFullYear();
        calMonth = now.getMonth();
      } else {
        const d = new Date(calYear, calMonth + Number(step), 1);
        calYear = d.getFullYear();
        calMonth = d.getMonth();
      }
      render();
    });
  });

  const fab = app.querySelector('[data-action="new-trade"]');
  if (fab) fab.addEventListener('click', () => openTradeModal(null));

  const editBtn = app.querySelector('[data-edit-trade]');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      openTradeModal(getTrade(editBtn.getAttribute('data-edit-trade')));
    });
  }

  const delBtn = app.querySelector('[data-del-trade]');
  if (delBtn) {
    delBtn.addEventListener('click', () => {
      const id = delBtn.getAttribute('data-del-trade');
      const trade = getTrade(id);
      confirmDialog(
        'Trade löschen?',
        `Der Trade „${trade ? trade.symbol : ''}" wird unwiderruflich entfernt.`,
        () => { removeTrade(id); navigate('/trades'); render(); }
      );
    });
  }

  const balanceBtn = app.querySelector('[data-action="set-balance"]');
  if (balanceBtn) {
    balanceBtn.addEventListener('click', () => {
      openModal('Startkapital', h(`
        <label class="field">
          <span>Startkapital (€)</span>
          <input name="startBalance" type="text" inputmode="decimal" placeholder="0,00" value="${esc(inputVal(getStartBalance() || ''))}" />
          <span class="hint">Kontostand zum Zeitpunkt, ab dem du trackst.</span>
        </label>`), (data) => {
        setStartBalance(data.startBalance);
        render();
      });
    });
  }

  const targetBtn = app.querySelector('[data-action="set-target"]');
  if (targetBtn) {
    targetBtn.addEventListener('click', () => {
      openModal('Zielbetrag', h(`
        <label class="field">
          <span>Zielbetrag (€)</span>
          <input name="targetBalance" type="text" inputmode="decimal" placeholder="0,00" value="${esc(inputVal(getTargetBalance() || ''))}" />
          <span class="hint">Kontostand, den du erreichen möchtest. 0 oder leer blendet das Ziel wieder aus.</span>
        </label>`), (data) => {
        setTargetBalance(data.targetBalance);
        render();
      });
    });
  }

  const exportBtn = app.querySelector('[data-action="export"]');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([exportData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trade-tracker-${todayKey()}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  const importBtn = app.querySelector('[data-action="import"]');
  const importFile = app.querySelector('#import-file');
  if (importBtn && importFile) {
    importBtn.addEventListener('click', () => importFile.click());
    importFile.addEventListener('change', () => {
      const file = importFile.files && importFile.files[0];
      if (!file) return;
      file.text()
        .then((text) => {
          const count = importData(text);
          render();
          confirmDialog('Import abgeschlossen', `${count} ${count === 1 ? 'Trade' : 'Trades'} übernommen.`, () => {}, 'OK');
        })
        .catch((err) => {
          confirmDialog('Import fehlgeschlagen', String(err.message || err), () => {}, 'OK');
        });
    });
  }

  const clearBtn = app.querySelector('[data-action="clear-data"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      confirmDialog(
        'Alle Daten löschen?',
        'Sämtliche Trades und das Startkapital werden unwiderruflich aus diesem Browser gelöscht.',
        () => { clearAll(); render(); }
      );
    });
  }
}

/* ============================================================
   Start
   ============================================================ */

load();
window.addEventListener('hashchange', render);
render();

// Service Worker registrieren (offline-Fähigkeit)
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
