import { icons } from './icons.js';
import {
  el, iconEl, formatDate, formatDateShort, formatDateLong, toDateInput, fromDateInput,
  toast, openModal, confirmDialog,
} from './ui.js';
import * as store from './store.js';
import {
  isFit, requirementStatus, REQUIREMENTS, deadlineRequirements, fitnessExpiryDate,
} from './fitness.js';
import { parseFeuerOn } from './importer.js';
import { scannerSupported, startScanner } from './scanner.js';
import { checkDeadlines, requestNotificationPermission } from './notifications.js';

/* ============================================================
   Navigation config
   ============================================================ */

const NAV = [
  { id: 'devices', label: 'Geräte', icon: icons.cube },
  { id: 'persons', label: 'Personen', icon: icons.person },
  { id: 'appointments', label: 'Termine', icon: icons.clipboard },
  { id: 'settings', label: 'Einstellungen', icon: icons.gear },
];

const STATE_META = {
  passed: { label: 'Bestanden', short: 'Bestanden', color: 'green', icon: icons.check },
  passedWithWarning: { label: 'Bestanden mit Warnung', short: 'Warnung', color: 'amber', icon: icons.warning },
  failed: { label: 'Nicht bestanden', short: 'Fehler', color: 'red', icon: icons.x },
};

/* ============================================================
   Router
   ============================================================ */

function currentRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const parts = raw.split('/').filter(Boolean);
  const section = parts[0] && NAV.some((n) => n.id === parts[0]) ? parts[0] : 'devices';
  return { section, id: parts[1] || null };
}
function go(hash) { location.hash = hash; }

/* ============================================================
   Shell
   ============================================================ */

const root = document.getElementById('app');
let contentEl, pageEl, topbarTitleEl, backBtn, topbarActionSlot;
const scrollMemory = {};

function buildShell() {
  const brand = el('div', { class: 'brand' },
    el('img', { class: 'brand__logo', src: 'icons/icon.svg', alt: '' }),
    el('div', {},
      el('div', { class: 'brand__name' }, 'AGTScan'),
      el('div', { class: 'brand__sub' }, 'Atemschutz-Verwaltung'),
    ),
  );
  const nav = el('nav', { class: 'nav' });
  NAV.forEach((item) => {
    const badge = el('span', { class: 'nav__badge', dataset: { badge: item.id } });
    badge.style.display = 'none';
    nav.append(el('a', { class: 'nav__item', href: `#/${item.id}`, dataset: { nav: item.id } },
      iconEl(item.icon), el('span', {}, item.label), badge));
  });
  const sidebar = el('aside', { class: 'sidebar' }, brand, nav,
    el('div', { class: 'sidebar__foot' }, 'Version 0.0.2'));

  backBtn = el('button', { class: 'topbar__back', 'aria-label': 'Zurück', onclick: () => history.back() }, iconEl(icons.chevronLeft));
  topbarTitleEl = el('h1', { class: 'topbar__title' }, 'Geräte');
  topbarActionSlot = el('div', { style: 'display:flex;gap:8px;align-items:center' });
  const topbar = el('header', { class: 'topbar' }, backBtn, topbarTitleEl,
    el('div', { class: 'topbar__spacer' }), topbarActionSlot);

  pageEl = el('main', { class: 'page' });
  contentEl = el('section', { class: 'content' }, topbar, pageEl);

  const tabbar = el('nav', { class: 'tabbar' });
  NAV.forEach((item) => {
    const badge = el('span', { class: 'tabbar__badge', dataset: { tabbadge: item.id } });
    badge.style.display = 'none';
    tabbar.append(el('a', { class: 'tabbar__item', href: `#/${item.id}`, dataset: { tab: item.id } },
      iconEl(item.icon), el('span', {}, item.label), badge));
  });

  root.append(el('div', { class: 'app' }, sidebar, contentEl, tabbar));
}

function setActiveNav(section) {
  document.querySelectorAll('[data-nav]').forEach((n) => n.classList.toggle('active', n.dataset.nav === section));
  document.querySelectorAll('[data-tab]').forEach((n) => n.classList.toggle('active', n.dataset.tab === section));
}

function updateBadges() {
  const count = appointmentsCount();
  document.querySelectorAll('[data-badge], [data-tabbadge]').forEach((b) => {
    const id = b.dataset.badge || b.dataset.tabbadge;
    if (id === 'appointments' && count > 0) {
      b.textContent = count > 99 ? '99+' : String(count);
      b.style.display = 'inline-flex';
    } else {
      b.style.display = 'none';
    }
  });
}

/* ============================================================
   Render
   ============================================================ */

function render() {
  const route = currentRoute();
  const key = location.hash;
  const view = buildView(route);

  setActiveNav(route.section);
  topbarTitleEl.textContent = view.title;
  backBtn.classList.toggle('show', !!view.back);
  topbarActionSlot.replaceChildren(...(view.actions || []));

  pageEl.replaceChildren(view.node);
  updateBadges();

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollMemory[key] || 0);
  });
}

function buildView(route) {
  if (route.section === 'devices') return route.id ? deviceDetailView(route.id) : deviceListView();
  if (route.section === 'persons') return route.id ? personDetailView(route.id) : personListView();
  if (route.section === 'appointments') return appointmentsView();
  if (route.section === 'settings') return settingsView();
  return deviceListView();
}

/* ============================================================
   Shared row builders
   ============================================================ */

function chevron() {
  return el('span', { class: 'row__chevron' }, iconEl(icons.chevronRight));
}
function emptyState(iconSvg, text) {
  return el('div', { class: 'empty' },
    el('div', { class: 'empty__icon' }, iconEl(iconSvg)),
    el('div', {}, text));
}

/** A tappable label/value row inside a card. */
function fieldRow({ label, value, onclick, muted }) {
  return el('button', { class: 'field', onclick },
    el('span', { class: 'field__label' }, label),
    el('span', { class: 'field__value' + (muted ? ' muted' : '') }, value || '—'),
    el('span', { class: 'row__chevron', style: 'margin-left:8px' }, iconEl(icons.chevronRight)));
}

/* ============================================================
   DEVICES — list
   ============================================================ */

function deviceListView() {
  const devices = store.getDevices();
  const addBtn = el('button', { class: 'icon-btn', 'aria-label': 'Gerät hinzufügen', onclick: openAddDevice }, iconEl(icons.plus));

  let node;
  if (!devices.length) {
    node = el('div', {},
      emptyState(icons.cube, 'Noch keine Geräte. Tippe auf +, um ein Gerät hinzuzufügen.'));
  } else {
    const list = el('div', { class: 'list' });
    devices.forEach((d) => {
      const sub = deviceSubtitle(d);
      list.append(el('a', { class: 'list__row', href: `#/devices/${d.id}`, dataset: { id: d.id } },
        el('div', { class: 'row__main' },
          el('div', { class: 'row__title' }, d.deviceName),
          sub && el('div', { class: 'row__sub' }, sub)),
        chevron()));
    });
    node = el('div', { class: 'card' }, list);
  }
  return { title: 'Geräte', actions: [addBtn], node };
}

function deviceSubtitle(d) {
  const last = store.lastInspectionDate(d);
  if (last) return 'Letzte Prüfung: ' + formatDate(last);
  return 'Noch keine Prüfung';
}

function openAddDevice() {
  formModal({
    title: 'Gerät hinzufügen',
    fields: [{ key: 'deviceName', label: 'Name', placeholder: 'erforderlich', required: true }],
    submitLabel: 'Hinzufügen',
    onSubmit: (v) => {
      const d = store.addDevice(v.deviceName.trim());
      toast('Gerät hinzugefügt');
      go(`#/devices/${d.id}`);
    },
  });
}

/* ============================================================
   DEVICES — detail
   ============================================================ */

function deviceDetailView(id) {
  const device = store.getDevice(id);
  if (!device) return notFoundView('Gerät nicht gefunden', '#/devices');

  const node = el('div', {});

  // General
  node.append(el('div', { class: 'section-title' }, 'Allgemein'));
  node.append(el('div', { class: 'card' },
    fieldRow({
      label: 'Name', value: device.deviceName,
      onclick: () => editDeviceName(device),
    })));

  // Part numbers
  node.append(el('div', { class: 'section-title' }, 'Teilenummern'));
  const partCard = el('div', { class: 'card' });
  const parts = [
    { key: 'plate', label: 'Trägerplatte', number: device.devicePlateNumber, date: device.devicePlateDate, scanText: 'Trägerplattennummer' },
    { key: 'bottle', label: 'Druckluftflasche', number: device.bottleNumber, date: device.bottleDate, scanText: 'Druckluftflaschennummer' },
    { key: 'mouthPiece', label: 'Lungenautomat', number: device.mouthPieceNumber, date: device.mouthPieceDate, scanText: 'Lungenautomatennummer' },
  ];
  parts.forEach((p) => {
    const scanIcon = iconEl(icons.scan);
    scanIcon.style.color = 'var(--text-3)';
    partCard.append(el('button', { class: 'field', onclick: () => scanPart(device, p) },
      scanIcon,
      el('div', { class: 'field__body' },
        el('div', {}, p.label),
        el('div', { class: 'field__hint', style: 'color:var(--text-3)' }, p.date ? formatDate(p.date) : 'nicht erfasst')),
      el('div', { class: 'field__value' + (p.number ? '' : ' muted') }, p.number || '—')));
  });
  node.append(partCard);

  // Inspections
  node.append(el('div', { class: 'section-title' }, 'Prüfungen'));
  const inspCard = el('div', { class: 'card' });
  const inspections = store.sortedInspections(device);
  if (!inspections.length) {
    inspCard.append(el('div', { class: 'empty', style: 'padding:24px' }, 'Noch keine Prüfungen erfasst.'));
  } else {
    const list = el('div', { class: 'list' });
    inspections.forEach((insp) => {
      const meta = STATE_META[insp.state] || STATE_META.passed;
      const pct = Math.max(0, Math.min(100, (insp.pressure / 350) * 100));
      const gauge = el('div', { class: 'gauge' }, el('span', { class: 'gauge__val' }, String(Math.round(insp.pressure))));
      gauge.style.setProperty('--p', pct);
      list.append(el('div', { class: 'list__row list__row--static insp-row' },
        el('span', { class: `dot ${meta.color}`, title: meta.label }),
        el('div', { class: 'row__main' },
          el('div', { class: 'row__title', style: 'font-weight:550' }, formatDate(insp.date)),
          el('div', { class: 'row__sub' }, meta.label + (insp.notes ? ' · ' + insp.notes : '')),
        ),
        gauge,
        el('button', { class: 'icon-btn icon-btn--ghost', 'aria-label': 'Prüfung löschen', style: 'color:var(--text-3)', onclick: async () => {
          if (await confirmDialog({ title: 'Prüfung löschen?', message: 'Diese Prüfung wird entfernt.', confirmLabel: 'Löschen', danger: true })) {
            store.deleteInspection(device.id, insp.id);
            toast('Prüfung gelöscht');
          }
        } }, iconEl(icons.trash)),
      ));
    });
    inspCard.append(list);
  }
  inspCard.append(el('button', { class: 'list__action', onclick: () => addInspectionModal(device) },
    iconEl(icons.plus), 'Prüfung hinzufügen'));
  node.append(inspCard);

  // Danger zone
  node.append(el('div', { style: 'margin-top:28px' },
    el('button', { class: 'btn btn--danger btn--block', onclick: async () => {
      if (await confirmDialog({ title: 'Gerät löschen?', message: `„${device.deviceName}“ und alle Prüfungen werden unwiderruflich gelöscht.`, confirmLabel: 'Löschen', danger: true })) {
        store.deleteDevice(device.id);
        toast('Gerät gelöscht');
        go('#/devices');
      }
    } }, iconEl(icons.trash), 'Gerät löschen')));

  return { title: device.deviceName, back: true, node };
}

function editDeviceName(device) {
  formModal({
    title: 'Namen editieren',
    fields: [{ key: 'deviceName', label: 'Name', value: device.deviceName, required: true }],
    submitLabel: 'Speichern',
    onSubmit: (v) => { store.updateDevice(device.id, { deviceName: v.deviceName.trim() }); toast('Gespeichert'); },
  });
}

function scanPart(device, part) {
  scanModal({
    title: part.scanText + ' scannen',
    current: part.number,
    onSubmit: (value) => {
      store.setDevicePart(device.id, part.key, value.trim());
      toast('Nummer gespeichert');
    },
  });
}

function addInspectionModal(device) {
  const stateVal = { current: 'passed' };
  const pressureVal = { current: 300 };
  openModal((close) => {
    const modal = el('div', { class: 'modal' });

    const dateInput = el('input', { class: 'input', type: 'date', value: toDateInput(new Date()) });

    const segButtons = {};
    const seg = el('div', { class: 'seg' });
    Object.entries(STATE_META).forEach(([key, meta]) => {
      const btn = el('button', { type: 'button', class: `seg__opt ${meta.color}` + (key === 'passed' ? ' active' : ''), onclick: () => {
        stateVal.current = key;
        Object.values(segButtons).forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      } }, iconEl(meta.icon), meta.short);
      segButtons[key] = btn;
      seg.append(btn);
    });

    const range = el('input', { type: 'range', min: '0', max: '350', step: '10', value: '300' });
    const rangeVal = el('div', { class: 'range-val' }, '300 bar');
    range.addEventListener('input', () => { pressureVal.current = +range.value; rangeVal.textContent = range.value + ' bar'; });

    const notes = el('textarea', { class: 'textarea', placeholder: 'optional' });

    modal.append(
      el('div', { class: 'modal__head' },
        el('div', { class: 'modal__title' }, 'Prüfung hinzufügen'),
        el('button', { class: 'modal__close', onclick: close, 'aria-label': 'Schließen' }, iconEl(icons.x))),
      el('div', { class: 'modal__body' },
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, 'Datum'), dateInput),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, 'Zustand'), seg),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, 'Druck'),
          el('div', { class: 'range-row' }, range, rangeVal)),
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, 'Notizen'), notes),
      ),
      el('div', { class: 'modal__foot' },
        el('button', { class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
        el('button', { class: 'btn btn--primary', onclick: () => {
          store.addInspection(device.id, {
            state: stateVal.current,
            pressure: pressureVal.current,
            notes: notes.value.trim(),
            date: fromDateInput(dateInput.value),
          });
          toast('Prüfung hinzugefügt');
          close();
        } }, 'Hinzufügen')),
    );
    return modal;
  });
}

/* ============================================================
   PERSONS — list
   ============================================================ */

function personListView() {
  const persons = store.getPersons();
  const addBtn = el('button', { class: 'icon-btn', 'aria-label': 'Person hinzufügen', onclick: openAddPerson }, iconEl(icons.plus));

  const node = el('div', {});
  if (!persons.length) {
    node.append(emptyState(icons.person, 'Noch keine Personen. Tippe auf +, um eine Person hinzuzufügen.'));
    return { title: 'Personen', actions: [addBtn], node };
  }

  const fit = persons.filter((p) => isFit(p));
  const unfit = persons.filter((p) => !isFit(p));

  const section = (label, list, ids) => {
    node.append(el('div', { class: 'section-title' }, label));
    if (!list.length) {
      node.append(el('div', { class: 'card' }, el('div', { class: 'empty', style: 'padding:20px' }, '—')));
      return;
    }
    const listEl = el('div', { class: 'list' });
    list.forEach((p) => {
      listEl.append(el('a', { class: 'list__row', href: `#/persons/${p.id}`, dataset: { id: p.id } },
        el('span', { class: `dot ${isFit(p) ? 'green' : 'red'}` }),
        el('div', { class: 'row__main' }, el('div', { class: 'row__title' }, p.firstName + ' ' + p.lastName)),
        chevron()));
    });
    node.append(el('div', { class: 'card' }, listEl));
  };

  section('Tauglich', fit);
  section('Nicht tauglich', unfit);

  return { title: 'Personen', actions: [addBtn], node };
}

function openAddPerson() {
  formModal({
    title: 'Person hinzufügen',
    fields: [
      { key: 'firstName', label: 'Vorname', placeholder: 'erforderlich', required: true },
      { key: 'lastName', label: 'Nachname', placeholder: 'erforderlich', required: true },
    ],
    submitLabel: 'Hinzufügen',
    onSubmit: (v) => {
      const p = store.addPerson(v.firstName.trim(), v.lastName.trim());
      toast('Person hinzugefügt');
      go(`#/persons/${p.id}`);
    },
  });
}

/* ============================================================
   PERSONS — detail
   ============================================================ */

const REQ_STATUS_COLOR = { valid: 'green', expired: 'red', redundant: 'gray' };
const REQ_STATUS_LABEL = { valid: 'gültig', expired: 'abgelaufen', redundant: 'nicht erforderlich' };

function personDetailView(id) {
  const person = store.getPerson(id);
  if (!person) return notFoundView('Person nicht gefunden', '#/persons');

  const fit = isFit(person);
  const node = el('div', {});

  // General — name with fitness status on the right (per TODO #3).
  node.append(el('div', { class: 'section-title' }, 'Allgemein'));
  node.append(el('div', { class: 'card' },
    el('button', { class: 'field', onclick: () => editPersonName(person) },
      el('span', { class: 'field__label' }, 'Name'),
      el('div', { class: 'field__value', style: 'display:flex;align-items:center;gap:10px' },
        el('span', {}, person.firstName + ' ' + person.lastName),
        el('span', { class: `pill ${fit ? 'green' : 'red'}` },
          iconEl(fit ? icons.check : icons.x), fit ? 'Tauglich' : 'Nicht tauglich'),
      ))));

  // Nachweise
  node.append(el('div', { class: 'section-title' }, 'Nachweise'));
  const card = el('div', { class: 'card' });
  REQUIREMENTS.forEach((req) => {
    const status = requirementStatus(person, req.id);
    const value = person[req.field];
    card.append(el('button', { class: 'field', onclick: () => editPersonDate(person, req) },
      el('span', { class: `dot ${REQ_STATUS_COLOR[status]}`, title: REQ_STATUS_LABEL[status] }),
      el('div', { class: 'field__body' },
        el('div', {}, req.title),
        !value && el('div', { class: 'field__hint' }, 'nicht erfasst')),
      el('div', { class: 'field__value' + (value ? '' : ' muted') }, value ? formatDateShort(value) : '—'),
      el('span', { class: 'row__chevron', style: 'margin-left:8px' }, iconEl(icons.chevronRight)),
    ));
  });
  node.append(card);

  node.append(el('div', { style: 'margin-top:28px' },
    el('button', { class: 'btn btn--danger btn--block', onclick: async () => {
      if (await confirmDialog({ title: 'Person löschen?', message: `„${person.firstName} ${person.lastName}“ wird unwiderruflich gelöscht.`, confirmLabel: 'Löschen', danger: true })) {
        store.deletePerson(person.id);
        toast('Person gelöscht');
        go('#/persons');
      }
    } }, iconEl(icons.trash), 'Person löschen')));

  return { title: person.firstName + ' ' + person.lastName, back: true, node };
}

function editPersonName(person) {
  formModal({
    title: 'Namen editieren',
    fields: [
      { key: 'firstName', label: 'Vorname', value: person.firstName, required: true },
      { key: 'lastName', label: 'Nachname', value: person.lastName, required: true },
    ],
    submitLabel: 'Speichern',
    onSubmit: (v) => { store.updatePerson(person.id, { firstName: v.firstName.trim(), lastName: v.lastName.trim() }); toast('Gespeichert'); },
  });
}

function editPersonDate(person, req) {
  const current = person[req.field];
  openModal((close) => {
    const modal = el('div', { class: 'modal' });
    const input = el('input', { class: 'input', type: 'date', value: current ? toDateInput(current) : '' });
    input.style.fontSize = '1.05rem';
    modal.append(
      el('div', { class: 'modal__head' },
        el('div', { class: 'modal__title' }, req.title),
        el('button', { class: 'modal__close', onclick: close, 'aria-label': 'Schließen' }, iconEl(icons.x))),
      el('div', { class: 'modal__body' },
        el('div', { class: 'form-group' },
          el('label', { class: 'label' }, 'Nachweisdatum'),
          input),
        el('p', { style: 'color:var(--text-3);font-size:0.82rem;line-height:1.4' },
          `Gültigkeit: ${req.years} ${req.years === 1 ? 'Jahr' : 'Jahre'}.` +
          (current ? ` Läuft ab am ${formatDateLong(addYearsStr(current, req.years))}.` : '')),
      ),
      el('div', { class: 'modal__foot' },
        current ? el('button', { class: 'btn btn--danger', onclick: () => { store.updatePerson(person.id, { [req.field]: null }); toast('Zurückgesetzt'); close(); } }, 'Löschen') : el('button', { class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
        el('button', { class: 'btn btn--primary', onclick: () => {
          if (!input.value) { close(); return; }
          store.updatePerson(person.id, { [req.field]: fromDateInput(input.value) });
          toast('Gespeichert');
          close();
        } }, 'Speichern')),
    );
    return modal;
  });
}

function addYearsStr(dateStr, years) {
  const d = new Date(dateStr); d.setFullYear(d.getFullYear() + years); return d;
}

/* ============================================================
   APPOINTMENTS
   ============================================================ */

function appointmentEntries() {
  const now = new Date();
  const monthAhead = new Date(now); monthAhead.setMonth(monthAhead.getMonth() + 1);

  const persons = [];
  for (const p of store.getPersons()) {
    const name = p.firstName + ' ' + p.lastName;
    for (const req of deadlineRequirements(p)) {
      if (!req.expiry) {
        persons.push({ severity: 'overdue', title: name, detail: `${req.title} — nicht erfasst`, date: null });
      } else if (req.expiry < now) {
        persons.push({ severity: 'overdue', title: name, detail: `${req.title} — abgelaufen am ${formatDate(req.expiry)}`, date: req.expiry });
      } else if (req.expiry <= monthAhead) {
        persons.push({ severity: 'soon', title: name, detail: `${req.title} — läuft ab am ${formatDate(req.expiry)}`, date: req.expiry });
      }
    }
  }

  const devices = [];
  for (const d of store.getDevices()) {
    const last = store.lastInspectionDate(d);
    if (!last) {
      devices.push({ severity: 'overdue', title: d.deviceName, detail: 'Noch keine Prüfung durchgeführt', date: null });
      continue;
    }
    const monthLater = new Date(last); monthLater.setMonth(monthLater.getMonth() + 1);
    if (now > monthLater) {
      devices.push({ severity: 'overdue', title: d.deviceName, detail: `Letzte Prüfung am ${formatDate(last)} — über einen Monat her`, date: last });
    } else {
      const weekBefore = new Date(monthLater); weekBefore.setDate(weekBefore.getDate() - 7);
      if (now >= weekBefore) {
        devices.push({ severity: 'soon', title: d.deviceName, detail: `Prüfung fällig am ${formatDate(monthLater)}`, date: monthLater });
      }
    }
  }

  const cmp = (a, b) => {
    if (a.severity !== b.severity) return a.severity === 'overdue' ? -1 : 1;
    if (a.date && b.date) return a.date - b.date;
    if (!a.date && b.date) return 1;
    if (a.date && !b.date) return -1;
    return a.title.localeCompare(b.title);
  };
  return { persons: persons.sort(cmp), devices: devices.sort(cmp) };
}

function appointmentsCount() {
  const { persons, devices } = appointmentEntries();
  return persons.length + devices.length;
}

function appointmentsView() {
  const { persons, devices } = appointmentEntries();
  const node = el('div', {});

  const deadlineRow = (e) => el('div', { class: 'list__row list__row--static', style: 'align-items:flex-start' },
    el('span', { class: `dot ${e.severity === 'overdue' ? 'red' : 'amber'}`, style: 'margin-top:5px' }),
    el('div', { class: 'row__main' },
      el('div', { class: 'row__title', style: 'font-weight:600' }, e.title),
      el('div', { class: 'row__sub', style: 'white-space:normal' }, e.detail)));

  const buildSection = (label, entries, emptyText) => {
    node.append(el('div', { class: 'section-title' }, label));
    const card = el('div', { class: 'card' });
    if (!entries.length) {
      card.append(el('div', { class: 'empty', style: 'padding:22px' }, emptyText));
    } else {
      const list = el('div', { class: 'list' });
      entries.forEach((e) => list.append(deadlineRow(e)));
      card.append(list);
    }
    node.append(card);
  };

  buildSection('Personen', persons, 'Keine anstehenden Tauglichkeiten');
  buildSection('Geräte', devices, 'Keine anstehenden Prüfungen');

  return { title: 'Termine', node };
}

/* ============================================================
   SETTINGS
   ============================================================ */

function settingsView() {
  const settings = store.getSettings();
  const node = el('div', {});

  // Install banner
  if (deferredInstall) {
    node.append(el('div', { class: 'install-banner' },
      iconEl(icons.install),
      el('div', { class: 'install-banner__txt' }, 'AGTScan als App installieren für schnellen Zugriff und Offline-Nutzung.'),
      el('button', { class: 'btn btn--primary', onclick: promptInstall }, 'Installieren')));
  }

  // Notifications
  node.append(el('div', { class: 'section-title' }, 'Benachrichtigungen'));
  const notifCard = el('div', { class: 'card' });
  notifCard.append(
    toggleRow('Geräteprüfungen', settings.deviceNotifications, async (val) => {
      store.updateSettings({ deviceNotifications: val });
      if (val) await requestNotificationPermission();
    }),
    toggleRow('Tauglichkeit Personen', settings.personNotifications, async (val) => {
      store.updateSettings({ personNotifications: val });
      if (val) await requestNotificationPermission();
    }),
  );
  node.append(notifCard);
  node.append(el('p', { style: 'color:var(--text-3);font-size:0.78rem;margin:8px 4px 0;line-height:1.4' },
    'Hinweis: Erinnerungen werden beim Öffnen der App geprüft und angezeigt.'));

  // Data
  node.append(el('div', { class: 'section-title' }, 'Daten'));
  const dataCard = el('div', { class: 'card' });
  const neutralAction = (iconSvg, label, onclick) => {
    const ic = iconEl(iconSvg); ic.style.color = 'var(--accent)';
    return el('button', { class: 'list__action', style: 'color:var(--text)', onclick }, ic, label);
  };
  dataCard.append(
    neutralAction(icons.download, 'FeuerOn Import', openImport),
    neutralAction(icons.download, 'Daten exportieren (JSON)', exportBackup),
    el('button', { class: 'list__action', style: 'color:var(--red)', onclick: async () => {
      if (await confirmDialog({ title: 'Alle Daten löschen?', message: 'Alle Geräte und Personen werden unwiderruflich gelöscht.', confirmLabel: 'Löschen', danger: true })) {
        store.deleteAllData();
        toast('Alle Daten gelöscht');
      }
    } }, iconEl(icons.trash), 'Alle Daten löschen'),
  );
  node.append(dataCard);

  // Info
  node.append(el('div', { class: 'section-title' }, 'Info'));
  node.append(el('div', { class: 'card' },
    el('div', { class: 'field field--static' },
      el('span', { class: 'field__label' }, 'Version'),
      el('span', { class: 'field__value' }, '0.0.2')),
    el('div', { class: 'field field--static' },
      el('span', { class: 'field__label' }, 'Geräte'),
      el('span', { class: 'field__value' }, String(store.getDevices().length))),
    el('div', { class: 'field field--static' },
      el('span', { class: 'field__label' }, 'Personen'),
      el('span', { class: 'field__value' }, String(store.getPersons().length))),
  ));

  return { title: 'Einstellungen', node };
}

function toggleRow(label, checked, onChange) {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('div', { class: 'toggle-row' },
    el('span', {}, label),
    el('label', { class: 'switch' }, input, el('span', { class: 'switch__slider' })));
}

function openImport() {
  const input = el('input', { type: 'file', accept: '.csv,text/csv', style: 'display:none' });
  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;
    try {
      let text = await file.text();
      // FeuerOn exports may be Latin-1; if UTF-8 decoding produced replacement chars, re-decode.
      if (text.includes('�')) {
        const buf = await file.arrayBuffer();
        text = new TextDecoder('iso-8859-1').decode(buf);
      }
      const parsed = parseFeuerOn(text);
      store.importPersons(parsed);
      toast(`${parsed.length} Personen importiert`);
    } catch (err) {
      confirmDialog({ title: 'Import fehlgeschlagen', message: err.message || String(err), confirmLabel: 'OK' });
    }
  });
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 1000);
}

function exportBackup() {
  const blob = new Blob([store.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `agtscan-backup-${toDateInput(new Date())}.json` });
  document.body.append(a); a.click(); a.remove();
  URL.revokeObjectURL(url);
  toast('Backup exportiert');
}

/* ============================================================
   Generic form modal
   ============================================================ */

function formModal({ title, fields, submitLabel, onSubmit }) {
  openModal((close) => {
    const modal = el('div', { class: 'modal' });
    const inputs = {};
    const body = el('div', { class: 'modal__body' });
    fields.forEach((f) => {
      const input = el('input', { class: 'input', type: 'text', value: f.value || '', placeholder: f.placeholder || '' });
      inputs[f.key] = input;
      body.append(el('div', { class: 'form-group' }, el('label', { class: 'label' }, f.label), input));
    });

    const submit = () => {
      const values = {};
      for (const f of fields) {
        const v = inputs[f.key].value.trim();
        if (f.required && !v) { inputs[f.key].focus(); return; }
        values[f.key] = inputs[f.key].value;
      }
      onSubmit(values);
      close();
    };
    body.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });

    modal.append(
      el('div', { class: 'modal__head' },
        el('div', { class: 'modal__title' }, title),
        el('button', { class: 'modal__close', onclick: close, 'aria-label': 'Schließen' }, iconEl(icons.x))),
      body,
      el('div', { class: 'modal__foot' },
        el('button', { class: 'btn btn--ghost', onclick: close }, 'Abbrechen'),
        el('button', { class: 'btn btn--primary', onclick: submit }, submitLabel)),
    );
    return modal;
  });
}

/* ============================================================
   Scan modal (barcode + manual entry)
   ============================================================ */

function scanModal({ title, current, onSubmit }) {
  openModal((close) => {
    const modal = el('div', { class: 'modal modal--wide' });
    const manual = el('input', { class: 'input', type: 'text', value: current || '', placeholder: 'Nummer eingeben oder scannen' });

    const scanArea = el('div', {});
    let stopScanner = null;

    const finish = (value) => {
      if (stopScanner) stopScanner();
      onSubmit(value);
      close();
    };

    const cleanup = () => { if (stopScanner) stopScanner(); };

    if (scannerSupported()) {
      const video = el('video', { class: '', muted: true, autoplay: true, playsinline: true });
      const scanner = el('div', { class: 'scanner' }, video,
        el('div', { class: 'scanner__frame' }),
        el('div', { class: 'scanner__hint' }, 'Barcode im Rahmen positionieren'));
      scanArea.append(scanner);
      startScanner(video, (value) => { manual.value = value; finish(value); }, (err) => {
        scanner.replaceChildren(el('div', { class: 'scanner__error' },
          'Kamera nicht verfügbar. Bitte Nummer manuell eingeben.'));
      }).then((stop) => { stopScanner = stop; }).catch(() => {});
    } else {
      scanArea.append(el('div', { class: 'card', style: 'padding:16px;margin-bottom:14px;color:var(--text-2);font-size:0.88rem;display:flex;gap:10px;align-items:center' },
        iconEl(icons.info), 'Barcode-Scanner wird auf diesem Gerät nicht unterstützt. Bitte die Nummer manuell eingeben.'));
    }

    modal.append(
      el('div', { class: 'modal__head' },
        el('div', { class: 'modal__title' }, title),
        el('button', { class: 'modal__close', onclick: () => { cleanup(); close(); }, 'aria-label': 'Schließen' }, iconEl(icons.x))),
      el('div', { class: 'modal__body' }, scanArea,
        el('div', { class: 'form-group' }, el('label', { class: 'label' }, 'Gerätenummer'), manual)),
      el('div', { class: 'modal__foot' },
        el('button', { class: 'btn btn--ghost', onclick: () => { cleanup(); close(); } }, 'Abbrechen'),
        el('button', { class: 'btn btn--primary', onclick: () => finish(manual.value.trim()) }, 'Übernehmen')),
    );
    return modal;
  }, { onClose: () => {} });
}

/* ============================================================
   Not-found
   ============================================================ */

function notFoundView(text, back) {
  return {
    title: 'Nicht gefunden', back: true,
    node: el('div', {}, emptyState(icons.inbox, text),
      el('div', { style: 'text-align:center' }, el('a', { class: 'btn btn--ghost', href: back }, 'Zurück'))),
  };
}

/* ============================================================
   PWA install prompt
   ============================================================ */

let deferredInstall = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstall = e;
  if (currentRoute().section === 'settings') render();
});
async function promptInstall() {
  if (!deferredInstall) return;
  deferredInstall.prompt();
  await deferredInstall.userChoice;
  deferredInstall = null;
  render();
}

/* ============================================================
   Init
   ============================================================ */

function init() {
  buildShell();

  // Save scroll position per view.
  window.addEventListener('scroll', () => { scrollMemory[location.hash] = window.scrollY; }, { passive: true });

  store.subscribe(() => render());
  window.addEventListener('hashchange', () => render());

  if (!location.hash) location.replace('#/devices');
  render();

  // Deadline check on load.
  const due = checkDeadlines();
  if (due.length) toast(`${due.length} anstehende ${due.length === 1 ? 'Erinnerung' : 'Erinnerungen'} — siehe Termine`);

  // Service worker.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
}

init();
