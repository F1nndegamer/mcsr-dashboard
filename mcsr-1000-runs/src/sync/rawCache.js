import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Local cache of raw MCSR API responses.
 *
 * Purpose: future reprocessing. If we later want another split we should be
 * able to recompute it from cached timelines instead of re-downloading the
 * whole history.
 *
 * SECURITY: only MCSR match payloads are stored here. Google credentials and
 * the MCSR private key are never written to the cache directory.
 */
export class RawCache {
  constructor({ dir }) {
    this.dir = dir;
    this.matchesDir = path.join(dir, "cache", "matches");
  }

  pathFor(matchId) {
    return path.join(this.matchesDir, `${matchId}.json`);
  }

  async save(matchId, payload) {
    await mkdir(this.matchesDir, { recursive: true });
    await writeFile(this.pathFor(matchId), JSON.stringify(payload, null, 2), "utf8");
    return this.pathFor(matchId);
  }

  async load(matchId) {
    try {
      return JSON.parse(await readFile(this.pathFor(matchId), "utf8"));
    } catch {
      return null;
    }
  }

  async has(matchId) {
    return (await this.load(matchId)) !== null;
  }

  async listMatchIds() {
    try {
      const files = await readdir(this.matchesDir);
      return files
        .filter((file) => file.endsWith(".json"))
        .map((file) => Number.parseInt(file.replace(".json", ""), 10))
        .filter((id) => Number.isFinite(id))
        .sort((a, b) => a - b);
    } catch {
      return [];
    }
  }

  /** Compact, normalised snapshot of every record (not a spreadsheet column set). */
  async saveNormalized(records) {
    await mkdir(this.dir, { recursive: true });
    const file = path.join(this.dir, "normalized-records.json");
    await writeFile(file, JSON.stringify(records, null, 2), "utf8");
    return file;
  }

  async saveLog(name, text) {
    await mkdir(path.join(this.dir, "logs"), { recursive: true });
    const file = path.join(this.dir, "logs", name);
    await writeFile(file, text, "utf8");
    return file;
  }
}

/** Small persisted sync state (last sync time, seasons scanned, player uuid). */
export class SyncStateStore {
  constructor({ dir }) {
    this.file = path.join(dir, "sync-state.json");
  }

  async read() {
    try {
      return JSON.parse(await readFile(this.file, "utf8"));
    } catch {
      return {};
    }
  }

  async write(state) {
    await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(state, null, 2), "utf8");
    return this.file;
  }
}
