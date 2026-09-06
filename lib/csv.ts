export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const input = text.replace(/^\uFEFF/, '');

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
      continue;
    }

    field += ch;
    i++;
  }

  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

export function toCSV(rows: (string | number | boolean | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((field) => {
          const s = field === null || field === undefined ? '' : String(field);
          // CSV formula injection: prefix cells whose *string* content begins
          // with an expression trigger so spreadsheet apps treat them as text,
          // not formulas. Numeric/boolean cells are left untouched.
          const unsafe =
            typeof field === 'string' && /^[=+\-@\t\r]/.test(s);
          const escaped = unsafe ? `'${s}` : s;
          if (
            escaped.includes(',') ||
            escaped.includes('"') ||
            escaped.includes('\n') ||
            escaped.includes('\r')
          ) {
            return '"' + escaped.replace(/"/g, '""') + '"';
          }
          return escaped;
        })
        .join(',')
    )
    .join('\r\n');
}