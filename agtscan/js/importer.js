// FeuerOn "Tauglichkeiten Atemschutz" CSV importer — mirrors FeuerOnImporter.swift.
//
// The format is strict: the header must match exactly, every row must have the
// expected number of semicolon-separated columns, names must be "Nachname, Vorname"
// and dates must be TT.MM.JJ. FeuerOn exports the date a qualification *expires*,
// so we subtract the validity window to recover the acquisition date the app stores.

export const EXPECTED_HEADER =
  'Name, Vorname;E ASG (Eignung) Gruppe 3 (Atemschutzgeräte G3);jährliche Belastungsübung (AS-ÜS);Unterweisung Atemschutz;Einsatz unter Atemschutz;Einsatz unter CSA;Einsatzübung unter Atemschutz;Einsatzübung unter CSA;alle Auflagen erfüllt';

const EXPECTED_COLUMNS = EXPECTED_HEADER.split(';').length;

class ImportError extends Error {}

function parseDate(value, validYears, lineNumber) {
  const v = value.trim();
  if (!v) return null;
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(v);
  if (!m) throw new ImportError(`Ungültiges Datum in Zeile ${lineNumber} (erwartet: TT.MM.JJ).`);
  const day = +m[1], month = +m[2], year = 2000 + +m[3];
  const d = new Date(year, month - 1, day, 12, 0, 0);
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    throw new ImportError(`Ungültiges Datum in Zeile ${lineNumber} (erwartet: TT.MM.JJ).`);
  }
  // Reverse the expiry: subtract the validity period to get the acquisition date.
  d.setFullYear(d.getFullYear() - validYears);
  return d.toISOString();
}

/** Parse CSV content → array of persons. Throws ImportError with a German message. */
export function parseFeuerOn(content) {
  const lines = content
    .split(/\r\n|\r|\n/)
    .map((l) => l.trim())
    .filter((l) => l.length);

  if (!lines.length) throw new ImportError('Die Datei enthält keine Daten.');
  if (lines[0] !== EXPECTED_HEADER) {
    throw new ImportError('Das Dateiformat stimmt nicht mit dem erwarteten FeuerOn-Format überein.');
  }

  const result = [];
  for (let i = 1; i < lines.length; i++) {
    const lineNumber = i + 1;
    const fields = lines[i].split(';');
    if (fields.length !== EXPECTED_COLUMNS) {
      throw new ImportError(`Ungültige Spaltenanzahl in Zeile ${lineNumber}.`);
    }
    const nameParts = fields[0].split(',').map((s) => s.trim());
    if (nameParts.length !== 2 || !nameParts[0] || !nameParts[1]) {
      throw new ImportError(`Ungültiges Namensformat in Zeile ${lineNumber} (erwartet: „Nachname, Vorname“).`);
    }
    result.push({
      lastName: nameParts[0],
      firstName: nameParts[1],
      g263Date: parseDate(fields[1], 3, lineNumber),
      courseDate: parseDate(fields[2], 1, lineNumber),
      theoryDate: parseDate(fields[3], 1, lineNumber),
      operationDate: parseDate(fields[4], 1, lineNumber),
      exerciseDate: parseDate(fields[6], 1, lineNumber),
    });
  }

  if (!result.length) throw new ImportError('Die Datei enthält keine Daten.');
  return result;
}
