// Data layer — localStorage-backed, with a change subscription.

const KEY = 'agtscan.data.v1';

const defaultData = () => ({
  devices: [],
  persons: [],
  settings: { deviceNotifications: true, personNotifications: true },
});

function uid() {
  return (crypto.randomUUID && crypto.randomUUID()) ||
    Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

let data = load();
const listeners = new Set();

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultData();
    const parsed = JSON.parse(raw);
    return {
      devices: Array.isArray(parsed.devices) ? parsed.devices : [],
      persons: Array.isArray(parsed.persons) ? parsed.persons : [],
      settings: Object.assign({ deviceNotifications: true, personNotifications: true }, parsed.settings || {}),
    };
  } catch {
    return defaultData();
  }
}

function persist() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch (e) { console.error('persist failed', e); }
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/* ---------------- Devices ---------------- */

export function getDevices() {
  return [...data.devices].sort((a, b) => a.order - b.order);
}
export function getDevice(id) {
  return data.devices.find((d) => d.id === id) || null;
}
export function addDevice(deviceName) {
  const device = {
    id: uid(),
    deviceName,
    devicePlateNumber: '', devicePlateDate: null,
    bottleNumber: '', bottleDate: null,
    mouthPieceNumber: '', mouthPieceDate: null,
    editDate: new Date().toISOString(),
    order: data.devices.length,
    inspections: [],
  };
  data.devices.push(device);
  persist();
  return device;
}
export function updateDevice(id, patch) {
  const d = getDevice(id);
  if (!d) return;
  Object.assign(d, patch, { editDate: new Date().toISOString() });
  persist();
}
export function deleteDevice(id) {
  data.devices = data.devices.filter((d) => d.id !== id);
  reindex(data.devices);
  persist();
}

/* Part-number scan sets number + records the scan date. */
export function setDevicePart(id, part, number) {
  const d = getDevice(id);
  if (!d) return;
  const map = {
    plate: ['devicePlateNumber', 'devicePlateDate'],
    bottle: ['bottleNumber', 'bottleDate'],
    mouthPiece: ['mouthPieceNumber', 'mouthPieceDate'],
  }[part];
  if (!map) return;
  d[map[0]] = number;
  d[map[1]] = new Date().toISOString();
  d.editDate = new Date().toISOString();
  persist();
}

/* ---------------- Inspections ---------------- */

export function addInspection(deviceId, { state, pressure, notes, date }) {
  const d = getDevice(deviceId);
  if (!d) return;
  d.inspections.push({ id: uid(), state, pressure, notes: notes || '', date });
  persist();
}
export function deleteInspection(deviceId, inspectionId) {
  const d = getDevice(deviceId);
  if (!d) return;
  d.inspections = d.inspections.filter((i) => i.id !== inspectionId);
  persist();
}
export function lastInspectionDate(device) {
  if (!device.inspections.length) return null;
  return device.inspections.reduce((max, i) => (i.date > max ? i.date : max), device.inspections[0].date);
}
export function sortedInspections(device) {
  return [...device.inspections].sort((a, b) => (a.date < b.date ? 1 : -1));
}

/* ---------------- Persons ---------------- */

export function getPersons() {
  return [...data.persons].sort((a, b) => a.order - b.order);
}
export function getPerson(id) {
  return data.persons.find((p) => p.id === id) || null;
}
export function addPerson(firstName, lastName, extra = {}) {
  const person = {
    id: uid(),
    firstName, lastName,
    order: data.persons.length,
    g263Date: null, exerciseDate: null, operationDate: null, courseDate: null, theoryDate: null,
    ...extra,
  };
  data.persons.push(person);
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
  data.persons = data.persons.filter((p) => p.id !== id);
  reindex(data.persons);
  persist();
}

/* ---------------- Settings ---------------- */

export function getSettings() { return { ...data.settings }; }
export function updateSettings(patch) {
  Object.assign(data.settings, patch);
  persist();
}

/* ---------------- Bulk ---------------- */

export function deleteAllData() {
  data.devices = [];
  data.persons = [];
  persist();
}
export function importPersons(parsedList) {
  let order = data.persons.length;
  for (const entry of parsedList) {
    data.persons.push({
      id: uid(),
      firstName: entry.firstName,
      lastName: entry.lastName,
      order: order++,
      g263Date: entry.g263Date || null,
      exerciseDate: entry.exerciseDate || null,
      operationDate: entry.operationDate || null,
      courseDate: entry.courseDate || null,
      theoryDate: entry.theoryDate || null,
    });
  }
  persist();
}
export function exportData() {
  return JSON.stringify(data, null, 2);
}

/* ---------------- helpers ---------------- */

function reindex(arr) {
  arr.sort((a, b) => a.order - b.order).forEach((item, i) => { item.order = i; });
}
