// ===== Domain logic: fitness rules, expiries, deadlines =====
// Faithfully mirrors Person.swift / AppointmentsView.swift.

/** Add `years` to an ISO date string, returning a Date (or null). */
export function addYears(iso, years) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  const r = new Date(d);
  r.setFullYear(r.getFullYear() + years);
  return r;
}

/** Whether a date exists and its (date + years) expiry is still >= now. */
export function isWithin(iso, years, now = new Date()) {
  const expiry = addYears(iso, years);
  return expiry != null && expiry >= now;
}

/**
 * A person is "tauglich" when:
 *  - G26.3 not older than 3 years, AND
 *  - Übung OR Einsatz not older than 1 year, AND
 *  - Atemschutzstrecke not older than 1 year, AND
 *  - Theoretische Unterweisung not older than 1 year.
 */
export function isFit(p, now = new Date()) {
  const g263 = isWithin(p.g263Date, 3, now);
  const practice = isWithin(p.exerciseDate, 1, now) || isWithin(p.operationDate, 1, now);
  const course = isWithin(p.courseDate, 1, now);
  const theory = isWithin(p.theoryDate, 1, now);
  return g263 && practice && course && theory;
}

/** Earliest expiry among all requirements, or null if any requirement is missing. */
export function fitnessExpiryDate(p) {
  const g263 = addYears(p.g263Date, 3);
  if (!g263) return null;
  const ex = addYears(p.exerciseDate, 1);
  const op = addYears(p.operationDate, 1);
  const practice = [ex, op].filter(Boolean).sort((a, b) => b - a)[0];
  if (!practice) return null;
  const course = addYears(p.courseDate, 1);
  if (!course) return null;
  const theory = addYears(p.theoryDate, 1);
  if (!theory) return null;
  return [g263, practice, course, theory].sort((a, b) => a - b)[0];
}

/** The five date fields and how long each stays valid. */
export const FIELDS = [
  { key: 'g263Date', id: 'g263', title: 'G26.3', years: 3 },
  { key: 'exerciseDate', id: 'exercise', title: 'Atemschutzübung', years: 1 },
  { key: 'operationDate', id: 'operation', title: 'Atemschutzeinsatz', years: 1 },
  { key: 'courseDate', id: 'course', title: 'Atemschutzstrecke', years: 1 },
  { key: 'theoryDate', id: 'theory', title: 'Theorie', years: 1 },
];

/**
 * Status of a single requirement for the coloured dot:
 *  'valid' (green), 'expired' (red), 'redundant' (gray – covered by OR sibling).
 */
export function fieldStatus(p, fieldId, now = new Date()) {
  const field = FIELDS.find(f => f.id === fieldId);
  if (isWithin(p[field.key], field.years, now)) return 'valid';
  if (fieldId === 'exercise') return isWithin(p.operationDate, 1, now) ? 'redundant' : 'expired';
  if (fieldId === 'operation') return isWithin(p.exerciseDate, 1, now) ? 'redundant' : 'expired';
  return 'expired';
}

/** Requirements with combined expiry, matching Person.requirements (Swift). */
export function requirements(p) {
  const practice = [addYears(p.exerciseDate, 1), addYears(p.operationDate, 1)]
    .filter(Boolean).sort((a, b) => b - a)[0] || null;
  return [
    { id: 'g263', title: 'G26.3', expiry: addYears(p.g263Date, 3) },
    { id: 'practice', title: 'Übung/Einsatz unter Atemschutz', expiry: practice },
    { id: 'course', title: 'Atemschutzstrecke', expiry: addYears(p.courseDate, 1) },
    { id: 'theory', title: 'Theoretische Unterweisung', expiry: addYears(p.theoryDate, 1) },
  ];
}

export function lastInspectionDate(device) {
  const dates = device.inspections.map(i => new Date(i.date)).filter(d => !isNaN(d));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map(d => d.getTime())));
}

// ---- Deadline entries for the Termine tab ----
export function personDeadlines(persons, now = new Date()) {
  const monthAhead = new Date(now); monthAhead.setMonth(monthAhead.getMonth() + 1);
  const entries = [];
  for (const p of persons) {
    const name = `${p.firstName} ${p.lastName}`;
    for (const req of requirements(p)) {
      if (!req.expiry) {
        entries.push({ severity: 'overdue', title: name, detail: `${req.title} — nicht erfasst`, date: null });
      } else if (req.expiry < now) {
        entries.push({ severity: 'overdue', title: name, detail: `${req.title} — abgelaufen am ${fmtDate(req.expiry)}`, date: req.expiry });
      } else if (req.expiry <= monthAhead) {
        entries.push({ severity: 'soon', title: name, detail: `${req.title} — läuft ab am ${fmtDate(req.expiry)}`, date: req.expiry });
      }
    }
  }
  return entries.sort(deadlineSort);
}

export function deviceDeadlines(devices, now = new Date()) {
  const entries = [];
  for (const d of devices) {
    const last = lastInspectionDate(d);
    if (!last) {
      entries.push({ severity: 'overdue', title: d.deviceName, detail: 'Noch keine Prüfung durchgeführt', date: null });
      continue;
    }
    const monthLater = new Date(last); monthLater.setMonth(monthLater.getMonth() + 1);
    if (now > monthLater) {
      entries.push({ severity: 'overdue', title: d.deviceName, detail: `Letzte Prüfung am ${fmtDate(last)} — über einen Monat her`, date: last });
    } else {
      const weekBefore = new Date(monthLater); weekBefore.setDate(weekBefore.getDate() - 7);
      if (now >= weekBefore) {
        entries.push({ severity: 'soon', title: d.deviceName, detail: `Prüfung fällig am ${fmtDate(monthLater)}`, date: monthLater });
      }
    }
  }
  return entries.sort(deadlineSort);
}

function deadlineSort(a, b) {
  if (a.severity !== b.severity) return a.severity === 'overdue' ? -1 : 1;
  if (a.date && b.date) return a.date - b.date;
  if (!a.date && b.date) return 1;
  if (a.date && !b.date) return -1;
  return a.title.localeCompare(b.title);
}

// ---- Formatting ----
export function fmtDate(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: 'short', year: 'numeric' });
}
export function fmtDateShort(d) {
  if (!d) return '';
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
