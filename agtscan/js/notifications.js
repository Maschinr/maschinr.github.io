// Best-effort deadline notifications.
//
// A PWA cannot schedule OS-level local notifications without a push server, so
// this checks deadlines whenever the app is opened and surfaces any that are due,
// de-duplicated per day via localStorage. Mirrors the intent of NotificationScheduler.swift.

import { getDevices, getPersons, getSettings, lastInspectionDate } from './store.js';
import { fitnessExpiryDate } from './fitness.js';

const SEEN_KEY = 'agtscan.notified';

export async function requestNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported';
  if (Notification.permission === 'default') {
    try { return await Notification.requestPermission(); } catch { return Notification.permission; }
  }
  return Notification.permission;
}

function seenToday() {
  try {
    const raw = JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
    return raw.date === new Date().toDateString() ? new Set(raw.ids) : new Set();
  } catch { return new Set(); }
}
function markSeen(ids) {
  localStorage.setItem(SEEN_KEY, JSON.stringify({ date: new Date().toDateString(), ids: [...ids] }));
}

/** Returns the list of due notification messages (also fires OS notifications if permitted). */
export function checkDeadlines() {
  const settings = getSettings();
  const now = new Date();
  const monthAhead = new Date(now); monthAhead.setMonth(monthAhead.getMonth() + 1);
  const due = [];

  if (settings.personNotifications) {
    for (const p of getPersons()) {
      const expiry = fitnessExpiryDate(p);
      if (!expiry || expiry <= now) continue;
      const notifyDate = new Date(expiry); notifyDate.setMonth(notifyDate.getMonth() - 1);
      if (notifyDate <= now && expiry > now) {
        due.push({ id: 'person-' + p.id, title: 'Tauglichkeit läuft ab', body: `${p.firstName} ${p.lastName} wird innerhalb des nächsten Monats untauglich.` });
      }
    }
  }

  if (settings.deviceNotifications) {
    for (const d of getDevices()) {
      const last = lastInspectionDate(d);
      if (!last) continue;
      const monthLater = new Date(last); monthLater.setMonth(monthLater.getMonth() + 1);
      if (monthLater <= now) {
        due.push({ id: 'device-overdue-' + d.id, title: 'Geräteprüfung überfällig', body: `Die letzte Prüfung von ${d.deviceName} ist über einen Monat her.` });
      } else {
        const warn = new Date(monthLater); warn.setDate(warn.getDate() - 7);
        if (warn <= now) {
          due.push({ id: 'device-warn-' + d.id, title: 'Geräteprüfung bald fällig', body: `Die Prüfung von ${d.deviceName} ist bald fällig.` });
        }
      }
    }
  }

  // Fire OS notifications for newly-due items only.
  if ('Notification' in window && Notification.permission === 'granted') {
    const seen = seenToday();
    const fresh = due.filter((n) => !seen.has(n.id));
    for (const n of fresh) {
      try { new Notification(n.title, { body: n.body, tag: n.id, icon: 'icons/icon-192.png' }); } catch { /* ignore */ }
      seen.add(n.id);
    }
    markSeen(seen);
  }

  return due;
}
