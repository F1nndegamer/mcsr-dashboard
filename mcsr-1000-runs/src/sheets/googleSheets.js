import { parseA1Range } from "./backend.js";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export class SheetsApiError extends Error {
  constructor(message, { status, detail } = {}) {
    super(message);
    this.name = "SheetsApiError";
    this.status = status;
    this.detail = detail;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Google Sheets backend implemented directly against the REST API.
 * No SDK dependency; accepts any token provider (see googleAuth.js).
 */
export class GoogleSheetsBackend {
  constructor({
    spreadsheetId,
    tokenProvider,
    fetchImpl = globalThis.fetch,
    sleep = defaultSleep,
    maxRetries = 5,
    baseBackoffMs = 700,
    logger = console,
  } = {}) {
    this.spreadsheetId = spreadsheetId;
    this.tokenProvider = tokenProvider;
    this.fetchImpl = fetchImpl;
    this.sleep = sleep;
    this.maxRetries = maxRetries;
    this.baseBackoffMs = baseBackoffMs;
    this.logger = logger;
    this.metadataCache = null;
  }

  async call(url, { method = "GET", body, expectJson = true } = {}) {
    let lastError;

    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      if (attempt > 0) {
        const backoff = this.baseBackoffMs * 2 ** (attempt - 1) + Math.floor(Math.random() * 300);
        this.logger.warn?.(`Retrying Google Sheets request (attempt ${attempt + 1}) in ${backoff}ms`);
        await this.sleep(backoff);
      }

      let token;
      try {
        token = await this.tokenProvider();
      } catch (error) {
        // Authentication errors are deterministic - do not retry.
        throw error;
      }

      let response;
      try {
        response = await this.fetchImpl(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
      } catch (error) {
        lastError = error;
        continue;
      }

      if (response.status === 429 || response.status >= 500) {
        lastError = new SheetsApiError(
          `Google Sheets responded ${response.status}`,
          { status: response.status, detail: await response.text().catch(() => "") },
        );
        continue;
      }

      const text = expectJson ? await response.text() : "";
      let payload = {};
      if (text) {
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { raw: text };
        }
      }

      if (!response.ok) {
        const message = payload?.error?.message ?? `HTTP ${response.status}`;
        throw new SheetsApiError(`Google Sheets request failed: ${message}`, {
          status: response.status,
          detail: payload?.error,
        });
      }

      return payload;
    }

    throw lastError instanceof SheetsApiError
      ? lastError
      : new SheetsApiError("Google Sheets request failed after retries.");
  }

  static async createSpreadsheet({ title, tokenProvider, fetchImpl } = {}) {
    const backend = new GoogleSheetsBackend({ spreadsheetId: "", tokenProvider, fetchImpl, logger: console });
    const created = await backend.call(SHEETS_API, {
      method: "POST",
      body: { properties: { title } },
    });
    return { spreadsheetId: created.spreadsheetId, spreadsheetUrl: created.spreadsheetUrl };
  }

  async getSheetMetadata() {
    const data = await this.call(
      `${SHEETS_API}/${this.spreadsheetId}?fields=sheets.properties`,
    );
    return (data.sheets ?? []).map((sheet) => ({
      title: sheet.properties.title,
      sheetId: sheet.properties.sheetId,
      index: sheet.properties.index,
    }));
  }

  async refreshMetadata() {
    this.metadataCache = null;
    return this.getSheetMetadata();
  }

  async getSheetTitles() {
    if (!this.metadataCache) this.metadataCache = await this.getSheetMetadata();
    return this.metadataCache.map((sheet) => sheet.title);
  }

  async ensureSheet(title) {
    const titles = await this.getSheetTitles();
    if (titles.includes(title)) return;
    await this.call(`${SHEETS_API}/${this.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await this.refreshMetadata();
  }

  async createSpreadsheet() {
    throw new SheetsApiError(
      "This backend is already bound to a spreadsheet; create one via GoogleSheetsBackend.createSpreadsheet().",
    );
  }

  async readValues(a1) {
    const { sheetTitle } = parseA1Range(a1);
    const range = encodeURIComponent(sheetTitle ? `${sheetTitle}!${a1.split("!").pop()}` : a1);
    const data = await this.call(
      `${SHEETS_API}/${this.spreadsheetId}/values/${range}?valueRenderOption=UNFORMATTED_VALUE&majorDimension=ROWS`,
    );
    return data.values ?? [];
  }

  /** @param {{updates: Array<{range: string, values: any[][], valueInputOption?: string}>}} payload */
  async batchUpdateValues({ updates = [], valueInputOption = "RAW" } = {}) {
    if (updates.length === 0) return { totalUpdatedCells: 0 };
    return this.call(`${SHEETS_API}/${this.spreadsheetId}/values:batchUpdate`, {
      method: "POST",
      body: {
        valueInputOption,
        data: updates.map((update) => ({
          range: update.range,
          majorDimension: update.majorDimension ?? "ROWS",
          values: update.values,
        })),
      },
    });
  }

  async batchUpdateSpreadsheet({ requests = [] } = {}) {
    if (requests.length === 0) return { replies: [] };
    return this.call(`${SHEETS_API}/${this.spreadsheetId}:batchUpdate`, {
      method: "POST",
      body: { requests },
    });
  }

  /**
   * Clears VALUES inside an A1 range via `updateCells` + `fields:
   * userEnteredValue`. Deliberately NOT `values.clear` / NOT a sheet deletion:
   * formatting, filters, frozen panes and the spreadsheet itself survive, so
   * `npm run reset` can never destroy layout or the document.
   */
  async clearRange(a1) {
    const { sheetTitle, startCol, startRow, endCol, endRow } = parseA1Range(a1);
    const metadata = await this.getSheetMetadata();
    const sheet = metadata.find((entry) => entry.title === sheetTitle);
    if (!sheet) {
      throw new SheetsApiError(`Sheet "${sheetTitle}" not found; nothing was cleared.`);
    }
    await this.batchUpdateSpreadsheet({
      requests: [
        {
          updateCells: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: startRow,
              endRowIndex: endRow + 1,
              startColumnIndex: startCol,
              endColumnIndex: endCol + 1,
            },
            fields: "userEnteredValue",
          },
        },
      ],
    });
    return { clearedCells: (endRow - startRow + 1) * (endCol - startCol + 1) };
  }
}
