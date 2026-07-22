// ===== AGTScan PWA – main app & views =====
import * as store from './store.js';
import * as dom from './domain.js';
import { parseFeuerOn } from './feueron.js';
import {
  el, group, section, chevron, icon, openSheet, confirmDialog, toast,
  openDatePicker, openScanner,
} from './ui.js';

const viewEl = document.getElementById('view');
const titleEl = document.getElementById('page-title');
const actionsEl = document.getElementById('topbar-actions');
const tabbar = document.getElementById('tabbar');

const TABS = {
  devices: 'Geräte',
  persons: 'Personen',
  appointments: 'Termine',
  settings: 'Einstellungen',
};

// Navigation: a root tab plus an optional detail on top.
let nav = { tab: 'devices', detail: null }; // detail: {type:'device'|'person', id}
let editing = false; // reorder/delete mode for lists

function go(tab) {
  nav = { tab, detail: null };
  editing = false;
  render();
}
function openDetail(type, id) {
  nav.detail = { type, id };
  render();
}
function back() {
  nav.detail = null;
  render();
}

// ---- Render dispatch ----
function render() {
  // tab bar state
  tabbar.querySelectorAll('.tab').forEach(t => {
    t.setAttribute('aria-selected', String(t.dataset.tab === nav.tab));
  });
  actionsEl.innerHTML = '';
  viewEl.scrollTop = 0;

  if (nav.detail?.type === 'device') return renderDeviceDetail(nav.detail.id);
  if (nav.detail?.type === 'person') return renderPersonDetail(nav.detail.id);

  switch (nav.tab) {
    case 'devices': return renderDevices();
    case 'persons': return renderPersons();
    case 'appointments': return renderAppointments();
    case 'settings': return renderSettings();
  }
}

function setContent(node) {
  viewEl.innerHTML = '';
  viewEl.append(el('div.container', {}, [node]));
}

function backButton() {
  return el('button.btn.back-icon', { 'aria-label': 'Zurück', onclick: back }, [icon('back')]);
}
function editButton() {
  return el('button.btn', { text: editing ? 'Fertig' : 'Bearb.', onclick: () => { editing = !editing; render(); } });
}
function addButton(onClick, label) {
  return el('button.btn.plus-icon', { 'aria-label': label, onclick: onClick }, [icon('plus')]);
}

// ============================================================
// DEVICES
// ============================================================
function renderDevices() {
  titleEl.textContent = 'Geräte';
  const devices = store.getDevices();
  actionsEl.append(devices.length ? editButton() : el('span'), addButton(promptAddDevice, 'Gerät hinzufügen'));

  if (!devices.length) {
    setContent(el('div.empty', { text: 'Noch keine Geräte. Tippe auf +, um eines hinzuzufügen.' }));
    return;
  }
  const rows = devices.map((d, i) => listRow({
    title: d.deviceName,
    onClick: editing ? null : () => openDetail('device', d.id),
    editing,
    onDelete: () => deleteDeviceConfirm(d),
    index: i, count: devices.length,
    onMove: (dir) => moveDevice(d.id, dir),
  }));
  setContent(section(null, group(rows)));
}

function promptAddDevice() {
  const input = el('input.trailing', { type: 'text', placeholder: 'erforderlich' });
  const body = el('div.container', {}, [section(null, group([
    el('div.row', {}, [el('span.field-label', { text: 'Name' }), input]),
  ]))]);
  const sheet = openSheet({
    title: 'Gerät hinzufügen', body, confirmLabel: 'Hinzufügen', confirmEnabled: false,
    onConfirm: () => {
      const name = input.value.trim();
      if (!name) return false;
      store.addDevice(name); render(); return true;
    },
  });
  input.addEventListener('input', () => sheet.setConfirmEnabled(!!input.value.trim()));
}

function deleteDeviceConfirm(d) {
  confirmDialog({
    title: `„${d.deviceName}“ löschen?`, message: 'Alle Prüfungen dieses Geräts werden entfernt.',
    confirmLabel: 'Löschen', destructive: true,
    onConfirm: () => { store.deleteDevice(d.id); render(); },
  });
}
function moveDevice(id, dir) {
  const ids = store.getDevices().map(d => d.id);
  const i = ids.indexOf(id), j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  store.reorderDevices(ids); render();
}

function renderDeviceDetail(id) {
  const d = store.getDevice(id);
  if (!d) return back();
  titleEl.textContent = d.deviceName;
  actionsEl.append(el('span'));
  viewEl.innerHTML = '';
  const backRow = el('div', { style: 'margin-bottom:8px' }, [backButton()]);

  // Allgemein
  const general = section('Allgemein', group([
    tapRow({ label: 'Name', value: d.deviceName, onClick: () => editDeviceName(d) }),
  ]));

  // Teilenummern
  const parts = section('Teilenummern', group([
    scanRow(d, 'Trägerplatte', 'devicePlateNumber', 'devicePlateDate', 'Trägerplattennummer scannen'),
    scanRow(d, 'Druckluftflasche', 'bottleNumber', 'bottleDate', 'Druckluftflaschennummer scannen'),
    scanRow(d, 'Lungenautomat', 'mouthPieceNumber', 'mouthPieceDate', 'Lungenautomatennummer scannen'),
  ]), 'Zum Scannen oder Bearbeiten auf eine Zeile tippen.');

  // Prüfungen
  const inspections = [...d.inspections].sort((a, b) => new Date(b.date) - new Date(a.date));
  const inspRows = inspections.map((insp, i) => inspectionRow(d, insp, i, inspections.length));
  inspRows.push(el('button.row.btn-row', { onclick: () => addInspection(d) }, [
    el('span.link', {}, [icon('plus')]), el('span.link', { text: 'Prüfung hinzufügen', style: 'margin-left:4px' }),
  ]));
  const inspSection = section('Prüfungen', group(inspRows));

  const wrap = el('div.container', {}, [backRow, general, parts, inspSection]);
  viewEl.append(wrap);
}

function editDeviceName(d) {
  const input = el('input.trailing', { type: 'text', value: d.deviceName });
  const body = el('div.container', {}, [section(null, group([
    el('div.row', {}, [el('span.field-label', { text: 'Name' }), input]),
  ]))]);
  const sheet = openSheet({
    title: 'Namen editieren', body, confirmLabel: 'Speichern',
    onConfirm: () => {
      const name = input.value.trim();
      if (!name) return false;
      store.updateDevice(d.id, { deviceName: name }); render(); return true;
    },
  });
  input.addEventListener('input', () => sheet.setConfirmEnabled(!!input.value.trim()));
}

function scanRow(d, label, numField, dateField, scanTitle) {
  const num = d[numField];
  const date = d[dateField];
  return tapRow({
    label,
    subtitle: date ? dom.fmtDate(date) : null,
    value: num || '—',
    onClick: () => openScanner({
      title: scanTitle, initialValue: num,
      onResult: (scanned) => {
        store.updateDevice(d.id, { [numField]: scanned, [dateField]: new Date().toISOString() });
        render();
      },
    }),
  });
}

function inspectionRow(d, insp, index, count) {
  const colorMap = { passed: 'green', failed: 'red', passedWithWarning: 'yellow' };
  const labelMap = { passed: 'Bestanden', failed: 'Nicht bestanden', passedWithWarning: 'Bestanden mit Warnung' };
  const pct = Math.round((insp.pressure / 350) * 100);
  const gauge = el('div.gauge', { style: `--p:${pct}`, 'aria-label': `${Math.round(insp.pressure)} bar` },
    [el('span', { text: String(Math.round(insp.pressure)) })]);

  const main = el('div.row-main', {}, [
    el('span.row-title', { text: dom.fmtDate(insp.date) }),
    el('span.row-subtitle', { text: labelMap[insp.state] + (insp.notes ? ` · ${insp.notes}` : '') }),
  ]);

  const children = [
    el('span.dot', { class: `dot ${colorMap[insp.state]}`, 'aria-label': labelMap[insp.state] }),
    main,
    gauge,
  ];
  if (editing || true) {
    // Provide a delete affordance via long context: use a small delete button when in editing? Keep swipe-free: add delete button always subtle.
  }
  const row = el('div.row', {}, children);
  // Delete button (shown in editing mode)
  if (editing) {
    row.append(el('button.btn', { text: 'Löschen', style: 'color:var(--danger);padding:4px 8px;font-size:14px',
      onclick: () => { store.deleteInspection(d.id, insp.id); render(); } }));
  }
  return row;
}

function addInspection(d) {
  let state = 'passed';
  let pressure = 300;
  const dateInput = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
  const stateSeg = el('div.segmented', {}, [
    segBtn('Bestanden', () => state = 'passed', true),
    segBtn('Warnung', () => state = 'passedWithWarning'),
    segBtn('Nicht best.', () => state = 'failed'),
  ]);
  bindSegmented(stateSeg, v => state = ['passed', 'passedWithWarning', 'failed'][v]);
  const pVal = el('span.field-value', { text: `${pressure} bar` });
  const slider = el('input', { type: 'range', min: '0', max: '350', step: '10', value: String(pressure) });
  slider.addEventListener('input', () => { pressure = +slider.value; pVal.textContent = `${pressure} bar`; });
  const notes = el('textarea', { placeholder: 'optional' });

  const body = el('div.container', {}, [
    section('Datum', group([el('div.row', {}, [el('span.field-label', { text: 'Datum' }), dateInput])])),
    section('Zustand', group([el('div.row', { style: 'padding:10px 12px' }, [stateSeg])])),
    section('Druck', group([
      el('div.row', {}, [el('span.field-label', { text: 'Druck' }), pVal]),
      el('div.row', {}, [slider]),
    ])),
    section('Notizen', group([el('div.row', {}, [notes])])),
  ]);
  openSheet({
    title: 'Prüfung hinzufügen', body, confirmLabel: 'Hinzufügen',
    onConfirm: () => {
      store.addInspection(d.id, {
        state, pressure, notes: notes.value.trim(),
        date: new Date(dateInput.value || Date.now()).toISOString(),
      });
      render(); return true;
    },
  });
}

// ============================================================
// PERSONS
// ============================================================
function renderPersons() {
  titleEl.textContent = 'Personen';
  const persons = store.getPersons();
  actionsEl.append(persons.length ? editButton() : el('span'), addButton(promptAddPerson, 'Person hinzufügen'));

  if (!persons.length) {
    setContent(el('div.empty', { text: 'Noch keine Personen. Tippe auf + oder importiere aus FeuerOn (Einstellungen).' }));
    return;
  }
  const fit = persons.filter(p => dom.isFit(p));
  const unfit = persons.filter(p => !dom.isFit(p));

  const mkRow = (p, list, i) => listRow({
    dot: dom.isFit(p) ? 'green' : 'red',
    dotLabel: dom.isFit(p) ? 'tauglich' : 'nicht tauglich',
    title: `${p.firstName} ${p.lastName}`,
    onClick: editing ? null : () => openDetail('person', p.id),
    editing,
    onDelete: () => deletePersonConfirm(p),
    index: i, count: list.length,
    onMove: (dir) => movePerson(p, list, dir),
  });

  const secs = [];
  secs.push(section('Tauglich', fit.length ? group(fit.map((p, i) => mkRow(p, fit, i))) : group([el('div.empty', { text: 'Keine' })])));
  secs.push(section('Nicht tauglich', unfit.length ? group(unfit.map((p, i) => mkRow(p, unfit, i))) : group([el('div.empty', { text: 'Keine' })])));
  viewEl.innerHTML = '';
  viewEl.append(el('div.container', {}, secs));
}

function promptAddPerson() {
  const first = el('input.trailing', { type: 'text', placeholder: 'erforderlich' });
  const last = el('input.trailing', { type: 'text', placeholder: 'erforderlich' });
  const body = el('div.container', {}, [section(null, group([
    el('div.row', {}, [el('span.field-label', { text: 'Vorname' }), first]),
    el('div.row', {}, [el('span.field-label', { text: 'Nachname' }), last]),
  ]))]);
  const check = () => sheet.setConfirmEnabled(!!first.value.trim() && !!last.value.trim());
  const sheet = openSheet({
    title: 'Person hinzufügen', body, confirmLabel: 'Hinzufügen', confirmEnabled: false,
    onConfirm: () => {
      if (!first.value.trim() || !last.value.trim()) return false;
      store.addPerson(first.value.trim(), last.value.trim()); render(); return true;
    },
  });
  first.addEventListener('input', check);
  last.addEventListener('input', check);
}

function deletePersonConfirm(p) {
  confirmDialog({
    title: `„${p.firstName} ${p.lastName}“ löschen?`,
    confirmLabel: 'Löschen', destructive: true,
    onConfirm: () => { store.deletePerson(p.id); render(); },
  });
}
function movePerson(p, list, dir) {
  const ids = list.map(x => x.id);
  const i = ids.indexOf(p.id), j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  store.reorderPersons(ids); render();
}

function renderPersonDetail(id) {
  const p = store.getPerson(id);
  if (!p) return back();
  titleEl.textContent = `${p.firstName} ${p.lastName}`;
  viewEl.innerHTML = '';

  const backRow = el('div', { style: 'margin-bottom:8px' }, [backButton()]);

  const nameRow = el('button.row.tappable', { onclick: () => editPersonName(p) }, [
    el('span.field-label', { text: 'Name' }),
    el('div', { style: 'display:flex;align-items:center;gap:8px' }, [
      el('span.row-value', { text: `${p.firstName} ${p.lastName}` }),
      el('span.dot.lg', { class: `dot lg ${dom.isFit(p) ? 'green' : 'red'}`, 'aria-label': dom.isFit(p) ? 'tauglich' : 'nicht tauglich' }),
    ]),
    chevron(),
  ]);
  const general = section('Allgemein', group([nameRow]));

  const proofRows = dom.FIELDS.map(f => proofRow(p, f));
  const proofs = section('Nachweise', group(proofRows));

  viewEl.append(el('div.container', {}, [backRow, general, proofs]));
}

function proofRow(p, field) {
  const status = dom.fieldStatus(p, field.id);
  const value = p[field.key];
  const main = el('div.row-main', {}, [
    el('span.row-title', { text: field.title }),
    value ? null : el('span.tag-missing', { text: 'nicht erfasst' }),
  ]);
  return el('button.row.tappable', {
    onclick: () => openDatePicker({
      title: field.title,
      value: value,
      onPick: (v) => { store.updatePerson(p.id, { [field.key]: new Date(v).toISOString() }); render(); },
      onClear: value ? () => { store.updatePerson(p.id, { [field.key]: null }); render(); } : null,
    }),
  }, [
    el('span.dot.sm', { class: `dot sm ${status === 'valid' ? 'green' : status === 'redundant' ? 'gray' : 'red'}`, 'aria-label': status }),
    main,
    el('span.row-value', { text: value ? dom.fmtDateShort(value) : '' }),
    chevron(),
  ]);
}

function editPersonName(p) {
  const first = el('input.trailing', { type: 'text', value: p.firstName });
  const last = el('input.trailing', { type: 'text', value: p.lastName });
  const body = el('div.container', {}, [section(null, group([
    el('div.row', {}, [el('span.field-label', { text: 'Vorname' }), first]),
    el('div.row', {}, [el('span.field-label', { text: 'Nachname' }), last]),
  ]))]);
  openSheet({
    title: 'Namen editieren', body, confirmLabel: 'Speichern',
    onConfirm: () => {
      if (!first.value.trim() || !last.value.trim()) return false;
      store.updatePerson(p.id, { firstName: first.value.trim(), lastName: last.value.trim() });
      render(); return true;
    },
  });
}

// ============================================================
// APPOINTMENTS (Termine)
// ============================================================
function renderAppointments() {
  titleEl.textContent = 'Termine';
  const persons = store.getPersons();
  const devices = store.getDevices();
  const pEntries = dom.personDeadlines(persons);
  const dEntries = dom.deviceDeadlines(devices);

  const deadlineRow = (e) => el('div.row', {}, [
    el('span.dot', { class: `dot ${e.severity === 'overdue' ? 'red' : 'yellow'}`, style: 'margin-top:4px;align-self:flex-start',
      'aria-label': e.severity === 'overdue' ? 'abgelaufen' : 'läuft bald ab' }),
    el('div.row-main', {}, [
      el('span.row-title', { text: e.title, style: 'font-weight:500' }),
      el('span.row-subtitle', { text: e.detail }),
    ]),
  ]);

  const pSection = section('Personen',
    pEntries.length ? group(pEntries.map(deadlineRow)) : group([el('div.empty', { text: 'Keine anstehenden Tauglichkeiten' })]));
  const dSection = section('Geräte',
    dEntries.length ? group(dEntries.map(deadlineRow)) : group([el('div.empty', { text: 'Keine anstehenden Prüfungen' })]));

  viewEl.innerHTML = '';
  viewEl.append(el('div.container', {}, [pSection, dSection]));
}

// ============================================================
// SETTINGS
// ============================================================
function renderSettings() {
  titleEl.textContent = 'Einstellungen';
  const s = store.getSettings();

  const notif = section('Benachrichtigungen', group([
    toggleRow('Geräteprüfungen', s.deviceNotifications, v => { store.setSetting('deviceNotifications', v); maybeRequestNotify(v); }),
    toggleRow('Tauglichkeit Personen', s.personNotifications, v => { store.setSetting('personNotifications', v); maybeRequestNotify(v); }),
  ]), 'Erinnerungen werden beim Öffnen der App angezeigt, wenn Termine anstehen.');

  const csvInput = el('input', { type: 'file', accept: '.csv,text/csv', class: 'hidden' });
  csvInput.addEventListener('change', () => handleCsv(csvInput.files[0]));

  const misc = section('Sonstiges', group([
    el('button.row.btn-row', { onclick: () => csvInput.click() }, ['FeuerOn Import', csvInput]),
    el('button.row.btn-row', { onclick: exportBackup }, ['Datensicherung exportieren']),
    el('button.row.btn-row', { onclick: () => importBackupInput.click() }, ['Datensicherung importieren']),
    el('button.row.btn-row.destructive', { text: 'Alle Daten löschen', onclick: confirmDeleteAll }),
  ]));

  const importBackupInput = el('input', { type: 'file', accept: '.json,application/json', class: 'hidden' });
  importBackupInput.addEventListener('change', () => handleBackupImport(importBackupInput.files[0]));
  misc.append(importBackupInput);

  const info = section('Info', group([
    el('div.row', {}, [el('span.field-label', { text: 'Version' }), el('span.row-value', { text: '1.0.0 (Web)' })]),
    el('div.row', {}, [el('span.field-label', { text: 'App' }), el('span.row-value', { text: 'AGTScan' })]),
  ]), 'Web-Portierung der AGTScan iOS-App. Daten werden lokal in diesem Browser gespeichert.');

  viewEl.innerHTML = '';
  viewEl.append(el('div.container', {}, [notif, misc, info]));
}

function maybeRequestNotify(enabled) {
  if (enabled && 'Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

function handleCsv(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = parseFeuerOn(String(reader.result));
      for (const e of parsed) {
        store.addPerson(e.firstName, e.lastName, {
          g263Date: e.g263Date, courseDate: e.courseDate, theoryDate: e.theoryDate,
          operationDate: e.operationDate, exerciseDate: e.exerciseDate,
        });
      }
      toast(`${parsed.length} Personen importiert.`);
    } catch (err) {
      toast(err.message || 'Import fehlgeschlagen.');
    }
  };
  reader.onerror = () => toast('Datei konnte nicht gelesen werden.');
  // FeuerOn exports may be Latin-1; try UTF-8 first, browser handles decoding.
  reader.readAsText(file, 'utf-8');
}

function exportBackup() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `agtscan-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
}
function handleBackupImport(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { store.importData(String(reader.result)); toast('Datensicherung importiert.'); render(); }
    catch (e) { toast(e.message || 'Import fehlgeschlagen.'); }
  };
  reader.readAsText(file);
}
function confirmDeleteAll() {
  confirmDialog({
    title: 'Alle Daten löschen?',
    message: 'Alle Geräte und Personen werden unwiderruflich gelöscht.',
    confirmLabel: 'Löschen', destructive: true,
    onConfirm: () => { store.deleteAll(); toast('Alle Daten gelöscht.'); render(); },
  });
}

// ============================================================
// Shared row builders
// ============================================================
function listRow({ title, subtitle, dot, dotLabel, onClick, editing, onDelete, index, count, onMove }) {
  const children = [];
  if (editing && onDelete) {
    children.push(el('button.btn', { 'aria-label': 'Löschen', style: 'color:var(--danger);padding:0 6px 0 0',
      onclick: onDelete }, [minusCircle()]));
  }
  if (dot) children.push(el('span.dot', { class: `dot ${dot}`, 'aria-label': dotLabel || '' }));
  children.push(el('div.row-main', {}, [
    el('span.row-title', { text: title }),
    subtitle ? el('span.row-subtitle', { text: subtitle }) : null,
  ]));
  if (editing && onMove) {
    children.push(reorderControls(index, count, onMove));
  } else if (onClick) {
    children.push(chevron());
  }
  const tag = onClick ? 'button.row.tappable' : 'div.row';
  return el(tag, onClick ? { onclick: onClick } : {}, children);
}

function reorderControls(index, count, onMove) {
  return el('div.reorder-btns', {}, [
    el('button', { text: '▲', disabled: index === 0, 'aria-label': 'Nach oben', onclick: () => onMove(-1) }),
    el('button', { text: '▼', disabled: index === count - 1, 'aria-label': 'Nach unten', onclick: () => onMove(1) }),
  ]);
}

function minusCircle() {
  const s = el('span');
  s.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="var(--danger)"><circle cx="12" cy="12" r="10"/><rect x="6.5" y="11" width="11" height="2" rx="1" fill="#fff"/></svg>';
  return s.firstChild;
}

function tapRow({ label, value, subtitle, onClick }) {
  return el('button.row.tappable', { onclick: onClick }, [
    el('div.row-main', {}, [
      el('span.row-title', { text: label }),
      subtitle ? el('span.row-subtitle', { text: subtitle }) : null,
    ]),
    value != null ? el('span.row-value', { text: value }) : null,
    chevron(),
  ]);
}

function segBtn(label, onClick, active) {
  return el('button', { text: label, 'aria-pressed': active ? 'true' : 'false' });
}
function bindSegmented(seg, onChange) {
  const btns = [...seg.querySelectorAll('button')];
  btns.forEach((b, i) => b.addEventListener('click', () => {
    btns.forEach(x => x.setAttribute('aria-pressed', 'false'));
    b.setAttribute('aria-pressed', 'true');
    onChange(i);
  }));
}

function toggleRow(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  const toggle = el('label.toggle', {}, [input, el('span.track'), el('span.knob')]);
  return el('div.row', {}, [el('span.field-label', { text: label }), toggle]);
}

// ============================================================
// In-app reminders on launch
// ============================================================
function showReminders() {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const s = store.getSettings();
  let overdue = 0;
  if (s.personNotifications) overdue += dom.personDeadlines(store.getPersons()).filter(e => e.severity === 'overdue').length;
  if (s.deviceNotifications) overdue += dom.deviceDeadlines(store.getDevices()).filter(e => e.severity === 'overdue').length;
  if (overdue > 0) {
    try { new Notification('AGTScan', { body: `${overdue} überfällige${overdue === 1 ? 'r' : ''} Termin${overdue === 1 ? '' : 'e'} – siehe Termine-Tab.` }); } catch {}
  }
}

// ============================================================
// Boot
// ============================================================
tabbar.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => go(t.dataset.tab));
});

render();
showReminders();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
