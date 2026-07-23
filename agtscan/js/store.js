// Data layer — localStorage-backed, with a change subscription.

import { EVENT_TYPES } from './fitness.js';

const KEY = 'agtscan.data.v1';

const defaultData = () => ({
  devices: [],
  persons: [],
  events: [],
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
      events: Array.isArray(parsed.events) ? parsed.events : [],
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

/* ---------------- Events (Veranstaltungen) ---------------- */

export function getEvents() {
  // Newest first.
  return [...data.events].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
export function getEvent(id) {
  return data.events.find((e) => e.id === id) || null;
}

/**
 * Record an event and update the matching requirement date for every
 * participant. Returns the created event (with a name snapshot of participants
 * so it stays readable even if a person is later deleted).
 */
export function addEvent({ type, date, participantIds }) {
  const def = EVENT_TYPES.find((t) => t.id === type);
  if (!def || !date) return null;
  const participants = [];
  for (const pid of participantIds || []) {
    const p = getPerson(pid);
    if (!p) continue;
    p[def.field] = date;
    participants.push({ id: p.id, name: p.firstName + ' ' + p.lastName });
  }
  const event = { id: uid(), type, date, participants };
  data.events.push(event);
  persist();
  return event;
}

/** Removes the event log entry. Participant fitness dates are left untouched. */
export function deleteEvent(id) {
  data.events = data.events.filter((e) => e.id !== id);
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
  data.events = [];
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
