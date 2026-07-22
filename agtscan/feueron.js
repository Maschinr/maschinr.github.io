// ===== FeuerOn "Tauglichkeiten Atemschutz" CSV parser =====
// Mirrors FeuerOnImporter.swift. Strict format: exact header, TT.MM.JJ dates,
// "Nachname, Vorname" names. FeuerOn exports the *expiry* date, so the validity
// window (G26.3: 3 years, else 1 year) is subtracted to get the acquisition date.

export const EXPECTED_HEADER = 'Name, Vorname;E ASG (Eignung) Gruppe 3 (Atemschutzgeräte G3);jährliche Belastungsübung (AS-ÜS);Unterweisung Atemschutz;Einsatz unter Atemschutz;Einsatz unter CSA;Einsatzübung unter Atemschutz;Einsatzübung unter CSA;alle Auflagen erfüllt';

const EXPECTED_COLS = EXPECTED_HEADER.split(';').length;

class ImportError extends Error {}

/** Parse "dd.MM.yy" strictly into a Date, then subtract `years`. Returns ISO string or null. */
function acquisitionDate(value, years, line) {
  const v = (value || '').trim();
  if (v === '') return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(v);
  if (!m) throw new ImportError(`Ungültiges Datum in Zeile ${line} (erwartet: TT.MM.JJ).`);
  const day = +m[1], month = +m[2], yy = +m[3];
  const year = 2000 + yy; // FeuerOn two-digit years are 20xx
  const d = new Date(year, month - 1, day);
  // Reject overflow (e.g. 31.02) the way a strict formatter would.
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    throw new ImportError(`Ungültiges Datum in Zeile ${line} (erwartet: TT.MM.JJ).`);
  }
  d.setFullYear(d.getFullYear() - years);
  return toISODate(d);
}

function toISODate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseFeuerOn(content) {
  const lines = content
    .split(/\r\n|\r|\n/)
    .map(l => l.trim())
    .filter(l => l !== '');

  if (lines.length === 0) throw new ImportError('Die Datei enthält keine Daten.');
  if (lines[0] !== EXPECTED_HEADER) {
    throw new ImportError('Das Dateiformat stimmt nicht mit dem erwarteten FeuerOn-Format überein.');
  }

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const fields = lines[i].split(';');
    if (fields.length !== EXPECTED_COLS) {
      throw new ImportError(`Ungültige Spaltenanzahl in Zeile ${lineNumber}.`);
    }
    const nameParts = fields[0].split(',').map(s => s.trim());
    if (nameParts.length !== 2 || !nameParts[0] || !nameParts[1]) {
      throw new ImportError(`Ungültiges Namensformat in Zeile ${lineNumber} (erwartet: „Nachname, Vorname“).`);
    }
    result.push({
      lastName: nameParts[0],
      firstName: nameParts[1],
      g263Date: acquisitionDate(fields[1], 3, lineNumber),
      courseDate: acquisitionDate(fields[2], 1, lineNumber),
      theoryDate: acquisitionDate(fields[3], 1, lineNumber),
      operationDate: acquisitionDate(fields[4], 1, lineNumber),
      exerciseDate: acquisitionDate(fields[6], 1, lineNumber),
    });
  }

  if (result.length === 0) throw new ImportError('Die Datei enthält keine Daten.');
  return result;
}
