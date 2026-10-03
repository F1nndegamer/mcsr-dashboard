import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { MemoryBackend } from "./backend.js";

const isEmpty = (value) => value === undefined || value === null || value === "";

/**
 * Local JSON backend. Same interface as the Google Sheets backend, writes one
 * JSON file per sheet plus a CSV mirror of the Runs sheet. Useful for offline
 * runs and for inspecting exactly what would be written.
 */
export class FileBackend extends MemoryBackend {
  constructor({ dir, ...rest } = {}) {
    super(rest);
    this.dir = dir;
  }

  async persist() {
    await mkdir(this.dir, { recursive: true });
    for (const sheet of this.sheets.values()) {
      const file = path.join(this.dir, `${sheet.title.replace(/[^\w.-]+/g, "_")}.json`);
      await writeFile(file, JSON.stringify(sheet.rows, null, 2), "utf8");
    }
    await writeFile(
      path.join(this.dir, "spreadsheet-requests.json"),
      JSON.stringify(this.sheetRequests, null, 2),
      "utf8",
    );
  }

  async createSpreadsheet(name) {
    const result = await super.createSpreadsheet(name);
    await this.persist();
    return result;
  }

  async batchUpdateValues(payload) {
    const result = await super.batchUpdateValues(payload);
    await this.persist();
    return result;
  }

  async batchUpdateSpreadsheet(payload) {
    const result = await super.batchUpdateSpreadsheet(payload);
    await this.persist();
    return result;
  }

  /** Restores the previous run so incremental sync can be demonstrated. */
  async load() {
    for (const title of ["Runs", "Dashboard"]) {
      try {
        const raw = await readFile(path.join(this.dir, `${title}.json`), "utf8");
        const rows = JSON.parse(raw);
        const sheet = await this.ensureSheet(title);
        sheet.rows = rows;
      } catch {
        /* first run - nothing to load */
      }
    }
  }

  /** CSV mirror so the result is readable without a spreadsheet client. */
  async writeCsv() {
    const sheet = this.sheets.get("Runs");
    if (!sheet) return null;
    const escape = (value) => {
      const text = value === undefined || value === null ? "" : String(value);
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const csv = sheet.rows.map((row) => row.map(escape).join(",")).join("\n");
    const file = path.join(this.dir, "Runs.csv");
    await mkdir(this.dir, { recursive: true });
    await writeFile(file, `${csv}\n`, "utf8");
    return file;
  }

  async appendLog(name, text) {
    await mkdir(this.dir, { recursive: true });
    await appendFile(path.join(this.dir, name), text, "utf8");
  }
}

export { isEmpty };
