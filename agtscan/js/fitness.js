// Person fitness logic — mirrors Person.swift.
//
// A person is "tauglich" when:
//  - G26.3 is not older than 3 years, AND
//  - Übung OR Einsatz unter Atemschutz is not older than 1 year, AND
//  - Atemschutzstrecke is not older than 1 year, AND
//  - Theoretische Unterweisung is not older than 1 year.

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

/** Whether a date exists and its (date + years) expiry is still in the future. */
export function isWithin(dateStr, years, now = new Date()) {
  if (!dateStr) return false;
  return addYears(dateStr, years) >= now;
}

/** Expiry date (Date) of a requirement, or null if never recorded. */
export function expiryOf(dateStr, years) {
  return dateStr ? addYears(dateStr, years) : null;
}

export function isFit(person, now = new Date()) {
  const g263Valid = isWithin(person.g263Date, 3, now);
  const practiceValid = isWithin(person.exerciseDate, 1, now) || isWithin(person.operationDate, 1, now);
  const courseValid = isWithin(person.courseDate, 1, now);
  const theoryValid = isWithin(person.theoryDate, 1, now);
  return g263Valid && practiceValid && courseValid && theoryValid;
}

/** Earliest expiry among all requirements, or null if any is missing. */
export function fitnessExpiryDate(person) {
  const g263 = expiryOf(person.g263Date, 3);
  if (!g263) return null;
  const ex = expiryOf(person.exerciseDate, 1);
  const op = expiryOf(person.operationDate, 1);
  const practice = [ex, op].filter(Boolean).sort((a, b) => b - a)[0];
  if (!practice) return null;
  const course = expiryOf(person.courseDate, 1);
  if (!course) return null;
  const theory = expiryOf(person.theoryDate, 1);
  if (!theory) return null;
  return [g263, practice, course, theory].sort((a, b) => a - b)[0];
}

/** Requirement definitions (title + validity years + the person date field). */
export const REQUIREMENTS = [
  { id: 'g263', title: 'G26.3', field: 'g263Date', years: 3 },
  { id: 'exercise', title: 'Atemschutzübung', field: 'exerciseDate', years: 1 },
  { id: 'operation', title: 'Atemschutzeinsatz', field: 'operationDate', years: 1 },
  { id: 'course', title: 'Atemschutzstrecke', field: 'courseDate', years: 1 },
  { id: 'theory', title: 'Theoretische Unterweisung', field: 'theoryDate', years: 1 },
];

/**
 * Per-field status for the detail view.
 *  'valid'     — green, within validity window
 *  'expired'   — red, expired/missing and responsible for untauglichkeit
 *  'redundant' — gray, expired/missing but covered by its OR sibling
 */
export function requirementStatus(person, id, now = new Date()) {
  const map = { g263: ['g263Date', 3], exercise: ['exerciseDate', 1], operation: ['operationDate', 1], course: ['courseDate', 1], theory: ['theoryDate', 1] };
  const [field, years] = map[id];
  if (isWithin(person[field], years, now)) return 'valid';
  if (id === 'exercise') return isWithin(person.operationDate, 1, now) ? 'redundant' : 'expired';
  if (id === 'operation') return isWithin(person.exerciseDate, 1, now) ? 'redundant' : 'expired';
  return 'expired';
}

/**
 * Deadline requirements for the Termine view. The exercise/operation pair is an
 * OR requirement, so it collapses into one entry using the later of the two expiries.
 */
export function deadlineRequirements(person) {
  const practice = [expiryOf(person.exerciseDate, 1), expiryOf(person.operationDate, 1)]
    .filter(Boolean).sort((a, b) => b - a)[0] || null;
  return [
    { title: 'G26.3', expiry: expiryOf(person.g263Date, 3) },
    { title: 'Übung/Einsatz unter Atemschutz', expiry: practice },
    { title: 'Atemschutzstrecke', expiry: expiryOf(person.courseDate, 1) },
    { title: 'Theoretische Unterweisung', expiry: expiryOf(person.theoryDate, 1) },
  ];
}
