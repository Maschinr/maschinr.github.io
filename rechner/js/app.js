/* ============================================================
   Budget Rechner — App-Logik, Router & Ansichten
   ============================================================ */

import {
  load,
  getAccounts,
  getAccount,
  addAccount,
  removeAccount,
  addPayment,
  removePayment,
  accountBalance,
  totalBalance,
  paymentForPeriod,
  clearAll,
  INTERVAL_LABEL,
  PERIOD_LABEL,
} from './store.js';

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

const euro = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
});

function fmt(value) {
  return euro.format(value);
}

// Vorzeichen-Klasse für Bilanzfarben.
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
   Icons (Inline-SVG)
   ============================================================ */

const icons = {
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2"/><path d="M21 7H5a2 2 0 0 0 0 4h16"/><circle cx="17" cy="14" r="1.4" fill="currentColor" stroke="none"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/></svg>',
  settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 13a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6M14 11v6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>',
};

/* ============================================================
   Router
   ============================================================ */

function parseHash() {
  const hash = location.hash.replace(/^#\/?/, '');
  const parts = hash.split('/').filter(Boolean);
  return { parts };
}

function navigate(path) {
  location.hash = path;
}

function currentTab(parts) {
  if (parts[0] === 'kalender') return 'kalender';
  if (parts[0] === 'einstellungen') return 'einstellungen';
  return 'konten';
}

function render() {
  const { parts } = parseHash();
  let view;
  if (parts[0] === 'konto' && parts[1]) {
    view = renderAccountDetail(parts[1]);
  } else if (parts[0] === 'kalender') {
    view = renderCalendar();
  } else if (parts[0] === 'einstellungen') {
    view = renderSettings();
  } else {
    view = renderOverview();
  }

  const tab = currentTab(parts);
  app.innerHTML = view + renderTabBar(tab);
  wireEvents(parts);
  window.scrollTo(0, 0);
}

/* ============================================================
   Tab-Leiste
   ============================================================ */

function renderTabBar(active) {
  const tab = (id, href, label, icon) => h(`
    <a class="tab ${active === id ? 'active' : ''}" href="#/${href}">
      ${icon}<span>${label}</span>
    </a>`);
  return h(`
    <nav class="tabbar">
      ${tab('konten', 'konten', 'Konten', icons.wallet)}
      ${tab('kalender', 'kalender', 'Kalender', icons.calendar)}
      ${tab('einstellungen', 'einstellungen', 'Einstellungen', icons.settings)}
    </nav>`);
}

/* ============================================================
   Ansicht: Übersicht aller Konten
   ============================================================ */

function renderOverview() {
  const accounts = getAccounts();
  const total = totalBalance('monthly');

  const totalCard = h(`
    <div class="balance-hero ${toneClass(total)}">
      <span class="label">Gesamtbilanz</span>
      <span class="amount">${fmt(total)}</span>
      <span class="sub">pro Monat · ${accounts.length} ${accounts.length === 1 ? 'Konto' : 'Konten'}</span>
    </div>`);

  let list;
  if (accounts.length === 0) {
    list = h(`
      <div class="empty">
        <div class="empty-icon">${icons.wallet}</div>
        <p class="empty-title">Noch keine Konten</p>
        <p class="empty-text">Lege dein erstes Konto an, um regelmäßige Zahlungen zu erfassen.</p>
      </div>`);
  } else {
    list = h(`<div class="list">${accounts.map(overviewCard).join('')}</div>`);
  }

  return h(`
    <header class="topbar">
      <h1>Konten</h1>
    </header>
    <main class="content">
      ${totalCard}
      ${list}
      <button class="btn primary block" data-action="add-account">
        ${icons.plus}<span>Konto hinzufügen</span>
      </button>
    </main>`);
}

function overviewCard(account) {
  const bal = accountBalance(account, 'monthly');
  const count = account.payments.length;
  return h(`
    <div class="card row account-row" data-open-account="${account.id}">
      <div class="row-main">
        <div class="row-title">${esc(account.name)}</div>
        <div class="row-sub">${account.description ? esc(account.description) + ' · ' : ''}${count} ${count === 1 ? 'Zahlung' : 'Zahlungen'}</div>
      </div>
      <div class="row-end">
        <span class="pill ${toneClass(bal)}">${fmt(bal)}<small>/Monat</small></span>
        <button class="icon-btn danger" data-del-account="${account.id}" title="Konto löschen" aria-label="Konto löschen">${icons.trash}</button>
        <span class="chevron">${icons.chevron}</span>
      </div>
    </div>`);
}

/* ============================================================
   Ansicht: Konto-Detail
   ============================================================ */

function renderAccountDetail(id) {
  const account = getAccount(id);
  if (!account) {
    return h(`
      <header class="topbar">
        <a class="icon-btn" href="#/konten">${icons.back}</a>
        <h1>Konto</h1>
      </header>
      <main class="content">
        <div class="empty"><p class="empty-title">Konto nicht gefunden</p></div>
      </main>`);
  }

  const monthly = accountBalance(account, 'monthly');
  const weekly = accountBalance(account, 'weekly');
  const yearly = accountBalance(account, 'yearly');

  const balanceCard = h(`
    <div class="balance-hero ${toneClass(monthly)}">
      <span class="label">Bilanz</span>
      <span class="amount">${fmt(monthly)}</span>
      <span class="sub">pro Monat</span>
      <div class="hero-split">
        <div><span>${fmt(weekly)}</span><small>/Woche</small></div>
        <div><span>${fmt(yearly)}</span><small>/Jahr</small></div>
      </div>
    </div>`);

  let payments;
  if (account.payments.length === 0) {
    payments = h(`
      <div class="empty small">
        <p class="empty-title">Keine Zahlungen</p>
        <p class="empty-text">Füge eine regelmäßige Zahlung hinzu.</p>
      </div>`);
  } else {
    payments = h(`<div class="list">${account.payments.map((p) => paymentRow(account.id, p)).join('')}</div>`);
  }

  return h(`
    <header class="topbar">
      <a class="icon-btn" href="#/konten" aria-label="Zurück">${icons.back}</a>
      <div class="topbar-titles">
        <h1>${esc(account.name)}</h1>
        ${account.description ? `<p class="topbar-sub">${esc(account.description)}</p>` : ''}
      </div>
    </header>
    <main class="content">
      ${balanceCard}
      <div class="section-head">
        <h2>Regelmäßige Zahlungen</h2>
      </div>
      ${payments}
      <button class="btn primary block" data-action="add-payment" data-account="${account.id}">
        ${icons.plus}<span>Zahlung hinzufügen</span>
      </button>
    </main>`);
}

function paymentRow(accountId, p) {
  const monthly = paymentForPeriod(p, 'monthly');
  return h(`
    <div class="card row">
      <div class="row-main">
        <div class="row-title">${esc(p.name)}</div>
        <div class="row-sub">${INTERVAL_LABEL[p.interval]} · ${fmt(monthly)}/Monat</div>
      </div>
      <div class="row-end">
        <span class="pill ${toneClass(p.amount)}">${fmt(p.amount)}</span>
        <button class="icon-btn danger" data-del-payment="${p.id}" data-account="${accountId}" title="Zahlung löschen" aria-label="Zahlung löschen">${icons.trash}</button>
      </div>
    </div>`);
}

/* ============================================================
   Ansicht: Kalender
   ============================================================ */

let calendarPeriod = 'monthly';

function renderCalendar() {
  const period = calendarPeriod;
  const accounts = getAccounts();
  const total = totalBalance(period);

  const seg = (id, label) => h(`
    <button class="seg ${period === id ? 'active' : ''}" data-period="${id}">${label}</button>`);

  const perAccount = accounts.length === 0
    ? h(`<div class="empty small"><p class="empty-text">Keine Konten vorhanden.</p></div>`)
    : h(`<div class="list">${accounts.map((a) => {
        const bal = accountBalance(a, period);
        return h(`
          <div class="card row" data-open-account="${a.id}">
            <div class="row-main"><div class="row-title">${esc(a.name)}</div></div>
            <div class="row-end"><span class="pill ${toneClass(bal)}">${fmt(bal)}</span></div>
          </div>`);
      }).join('')}</div>`);

  const timeline = renderTimeline(period, total);

  return h(`
    <header class="topbar">
      <h1>Kalender</h1>
    </header>
    <main class="content">
      <div class="segmented">
        ${seg('weekly', 'Woche')}
        ${seg('monthly', 'Monat')}
        ${seg('yearly', 'Jahr')}
      </div>
      <div class="balance-hero ${toneClass(total)}">
        <span class="label">Budget pro ${PERIOD_LABEL[period]}</span>
        <span class="amount">${fmt(total)}</span>
        <span class="sub">über alle Konten</span>
      </div>
      <div class="section-head"><h2>Verlauf</h2></div>
      ${timeline}
      <div class="section-head"><h2>Je Konto</h2></div>
      ${perAccount}
    </main>`);
}

// Kommende Zeiträume mit Netto- und kumuliertem Budget.
function renderTimeline(period, perPeriod) {
  const count = period === 'weekly' ? 8 : period === 'monthly' ? 12 : 5;
  const now = new Date();
  const rows = [];
  let cumulative = 0;
  for (let i = 0; i < count; i++) {
    cumulative += perPeriod;
    rows.push(h(`
      <div class="card row timeline-row">
        <div class="row-main"><div class="row-title">${esc(periodLabel(period, now, i))}</div></div>
        <div class="row-end">
          <span class="pill ${toneClass(perPeriod)}">${fmt(perPeriod)}</span>
          <span class="cumulative ${toneClass(cumulative)}">Σ ${fmt(cumulative)}</span>
        </div>
      </div>`));
  }
  return h(`<div class="list">${rows.join('')}</div>`);
}

const MONTHS = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

function periodLabel(period, base, offset) {
  const d = new Date(base);
  if (period === 'weekly') {
    d.setDate(d.getDate() + offset * 7);
    return `KW ${isoWeek(d)} · ab ${d.getDate()}.${d.getMonth() + 1}.`;
  }
  if (period === 'monthly') {
    d.setMonth(d.getMonth() + offset, 1);
    return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
  }
  return `${base.getFullYear() + offset}`;
}

function isoWeek(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

/* ============================================================
   Ansicht: Einstellungen
   ============================================================ */

function renderSettings() {
  const accounts = getAccounts();
  const payments = accounts.reduce((n, a) => n + a.payments.length, 0);
  return h(`
    <header class="topbar">
      <h1>Einstellungen</h1>
    </header>
    <main class="content">
      <div class="card info-card">
        <h2>Gespeicherte Daten</h2>
        <p class="muted">Alle Daten werden ausschließlich lokal in diesem Browser gespeichert (localStorage). Es werden keine Daten an einen Server gesendet.</p>
        <div class="stat-grid">
          <div class="stat"><span class="stat-num">${accounts.length}</span><span class="stat-label">Konten</span></div>
          <div class="stat"><span class="stat-num">${payments}</span><span class="stat-label">Zahlungen</span></div>
        </div>
      </div>
      <button class="btn danger block" data-action="clear-data">
        ${icons.trash}<span>Alle Daten löschen</span>
      </button>
      <p class="app-version">Budget Rechner · PWA · offline nutzbar</p>
    </main>`);
}

/* ============================================================
   Modal / Dialog
   ============================================================ */

function openModal(title, bodyHtml, onSubmit) {
  modalRoot.innerHTML = h(`
    <div class="modal-backdrop">
      <div class="modal" role="dialog" aria-modal="true" aria-label="${esc(title)}">
        <div class="modal-head"><h2>${esc(title)}</h2></div>
        <form class="modal-body" id="modal-form">
          ${bodyHtml}
          <div class="modal-actions">
            <button type="button" class="btn ghost" data-modal-cancel>Abbrechen</button>
            <button type="submit" class="btn primary">Speichern</button>
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
   Formulare
   ============================================================ */

function accountForm() {
  return h(`
    <label class="field">
      <span>Name</span>
      <input name="name" type="text" placeholder="z. B. Girokonto" required maxlength="60" />
    </label>
    <label class="field">
      <span>Beschreibung</span>
      <input name="description" type="text" placeholder="Optional" maxlength="120" />
    </label>`);
}

function paymentForm() {
  const opts = Object.entries(INTERVAL_LABEL)
    .map(([v, l]) => `<option value="${v}" ${v === 'monthly' ? 'selected' : ''}>${l}</option>`)
    .join('');
  return h(`
    <label class="field">
      <span>Bezeichnung</span>
      <input name="name" type="text" placeholder="z. B. Miete, Gehalt" required maxlength="60" />
    </label>
    <div class="field-row">
      <label class="field">
        <span>Art</span>
        <select name="sign">
          <option value="-1">Ausgabe (−)</option>
          <option value="1">Einnahme (+)</option>
        </select>
      </label>
      <label class="field">
        <span>Betrag (€)</span>
        <input name="amount" type="number" inputmode="decimal" step="0.01" min="0" placeholder="0,00" required />
      </label>
    </div>
    <label class="field">
      <span>Intervall</span>
      <select name="interval">${opts}</select>
    </label>`);
}

/* ============================================================
   Event-Verdrahtung
   ============================================================ */

function wireEvents(parts) {
  // Karte anklicken -> Konto öffnen
  app.querySelectorAll('[data-open-account]').forEach((el) => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-del-account]')) return;
      navigate(`/konto/${el.getAttribute('data-open-account')}`);
    });
  });

  const addAcc = app.querySelector('[data-action="add-account"]');
  if (addAcc) {
    addAcc.addEventListener('click', () => {
      openModal('Konto hinzufügen', accountForm(), (data) => {
        if (!data.name || !data.name.trim()) return false;
        addAccount(data.name, data.description);
        render();
      });
    });
  }

  app.querySelectorAll('[data-del-account]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.getAttribute('data-del-account');
      const acc = getAccount(id);
      confirmDialog(
        'Konto löschen?',
        `„${acc ? acc.name : 'Konto'}" und alle zugehörigen Zahlungen werden entfernt.`,
        () => { removeAccount(id); render(); }
      );
    });
  });

  const addPay = app.querySelector('[data-action="add-payment"]');
  if (addPay) {
    addPay.addEventListener('click', () => {
      const accountId = addPay.getAttribute('data-account');
      openModal('Zahlung hinzufügen', paymentForm(), (data) => {
        const value = Math.abs(parseFloat(String(data.amount).replace(',', '.')));
        if (!isFinite(value)) return false;
        const amount = value * (data.sign === '1' ? 1 : -1);
        addPayment(accountId, { name: data.name, amount, interval: data.interval });
        render();
      });
    });
  }

  app.querySelectorAll('[data-del-payment]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePayment(btn.getAttribute('data-account'), btn.getAttribute('data-del-payment'));
      render();
    });
  });

  // Kalender Zeitraum-Umschalter
  app.querySelectorAll('[data-period]').forEach((btn) => {
    btn.addEventListener('click', () => {
      calendarPeriod = btn.getAttribute('data-period');
      render();
    });
  });

  const clearBtn = app.querySelector('[data-action="clear-data"]');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      confirmDialog(
        'Alle Daten löschen?',
        'Sämtliche Konten und Zahlungen werden unwiderruflich aus diesem Browser gelöscht.',
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
