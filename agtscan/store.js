// ===== Data store: persists devices & persons in localStorage =====
// Mirrors the SwiftData model of the AGTScan iOS app.

const KEY = 'agtscan.data.v1';
const SETTINGS_KEY = 'agtscan.settings.v1';

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2);
}

let state = load();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        devices: Array.isArray(parsed.devices) ? parsed.devices : [],
        persons: Array.isArray(parsed.persons) ? parsed.persons : [],
      };
    }
  } catch (e) { console.warn('load failed', e); }
  return { devices: [], persons: [] };
}

function persist() {
  localStorage.setItem(KEY, JSON.stringify(state));
}

// ---- Devices ----
export function getDevices() {
  return [...state.devices].sort((a, b) => a.order - b.order);
}
export function getDevice(id) {
  return state.devices.find(d => d.id === id) || null;
}
export function addDevice(deviceName) {
  const device = {
    id: uid(),
    deviceName,
    order: state.devices.length,
    devicePlateNumber: '', devicePlateDate: null,
    bottleNumber: '', bottleDate: null,
    mouthPieceNumber: '', mouthPieceDate: null,
    inspections: [],
  };
  state.devices.push(device);
  persist();
  return device;
}
export function updateDevice(id, patch) {
  const d = getDevice(id);
  if (!d) return;
  Object.assign(d, patch);
  persist();
}
export function deleteDevice(id) {
  state.devices = state.devices.filter(d => d.id !== id);
  persist();
}
export function reorderDevices(orderedIds) {
  orderedIds.forEach((id, i) => { const d = getDevice(id); if (d) d.order = i; });
  persist();
}

// ---- Inspections (child of device) ----
export function addInspection(deviceId, insp) {
  const d = getDevice(deviceId);
  if (!d) return;
  d.inspections.push({ id: uid(), ...insp });
  persist();
}
export function deleteInspection(deviceId, inspId) {
  const d = getDevice(deviceId);
  if (!d) return;
  d.inspections = d.inspections.filter(i => i.id !== inspId);
  persist();
}

// ---- Persons ----
export function getPersons() {
  return [...state.persons].sort((a, b) => a.order - b.order);
}
export function getPerson(id) {
  return state.persons.find(p => p.id === id) || null;
}
export function addPerson(firstName, lastName, extra = {}) {
  const person = {
    id: uid(),
    firstName, lastName,
    order: state.persons.length,
    g263Date: null, exerciseDate: null, operationDate: null,
    courseDate: null, theoryDate: null,
    ...extra,
  };
  state.persons.push(person);
  persist();
  return person;
}
export function updatePerson(id, patch) {
  const p = getPerson(id);
  if (!p) return;
  Object.assign(p, patch);
  persist();
}
export function deletePerson(id) {
  state.persons = state.persons.filter(p => p.id !== id);
  persist();
}
export function reorderPersons(orderedIds) {
  // Preserve existing order slots so cross-section order stays intact.
  const slots = orderedIds.map(id => getPerson(id)?.order).filter(v => v != null).sort((a, b) => a - b);
  orderedIds.forEach((id, i) => { const p = getPerson(id); if (p) p.order = slots[i]; });
  persist();
}

export function deleteAll() {
  state = { devices: [], persons: [] };
  persist();
}

// ---- Settings ----
export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (raw) return { deviceNotifications: true, personNotifications: true, ...JSON.parse(raw) };
  } catch (e) {}
  return { deviceNotifications: true, personNotifications: true };
}
export function setSetting(key, value) {
  const s = getSettings();
  s[key] = value;
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function exportData() {
  return JSON.stringify(state, null, 2);
}
export function importData(json) {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.devices) || !Array.isArray(parsed.persons)) {
    throw new Error('Ungültiges Datenformat.');
  }
  state = { devices: parsed.devices, persons: parsed.persons };
  persist();
}
