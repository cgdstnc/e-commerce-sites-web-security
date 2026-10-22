import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import readline from "node:readline";

const DELIMITER = ",";
const QUOTE = '"';
const ESCAPED_QUOTE = '""';
const LINE_ENDING = "\n";
const NEEDS_QUOTING = /[",\r\n]/;

export type CsvValue = string | number | boolean | null | undefined;
export type CsvRow = Record<string, CsvValue>;

export async function* readLines(file: string): AsyncGenerator<string> {
  const bytes = fs.createReadStream(file);
  const text = file.endsWith(".gz") ? bytes.pipe(zlib.createGunzip()) : bytes;

  const lines = readline.createInterface({ input: text, crlfDelay: Infinity });
  for await (const line of lines) {
    if (line.length > 0) yield line;
  }
}

export async function* readRows(file: string): AsyncGenerator<Record<string, string>> {
  let columns: string[] | null = null;

  for await (const line of readLines(file)) {
    const cells = parseLine(line);

    if (!columns) {
      columns = cells;
      continue;
    }

    const row: Record<string, string> = {};
    columns.forEach((column, i) => (row[column] = cells[i] ?? ""));
    yield row;
  }
}

export function parseLine(line: string): string[] {
  if (!line.includes(QUOTE)) return line.split(DELIMITER);

  const cells: string[] = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (insideQuotes) {
      if (char !== QUOTE) cell += char;
      else if (line[i + 1] === QUOTE) (cell += QUOTE), i++;
      else insideQuotes = false;
    } else if (char === QUOTE) {
      insideQuotes = true;
    } else if (char === DELIMITER) {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }

  cells.push(cell);
  return cells;
}

export function writeCsv(file: string, columns: string[], rows: CsvRow[]): void {
  const header = columns.join(DELIMITER);
  const body = rows.map((row) => columns.map((column) => formatCell(row[column])).join(DELIMITER));

  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [header, ...body].join(LINE_ENDING) + LINE_ENDING, "utf-8");
}

function formatCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";

  const text = String(value);
  if (!NEEDS_QUOTING.test(text)) return text;

  return QUOTE + text.replaceAll(QUOTE, ESCAPED_QUOTE) + QUOTE;
}
