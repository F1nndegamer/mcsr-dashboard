import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { MemoryBackend } from "../src/sheets/backend.js";
import { STREAM_BLOCK_LABEL, STREAM_LINK_LABELS } from "../src/models/constants.js";
import { COLUMN_COUNT, LAST_COLUMN_LETTER } from "../src/models/runRecord.js";
import { dashboardBuild } from "../src/sheets/dashboard.js";
import { initializeSheets } from "../src/sheets/index.js";
import {
  buildStreamBlockRows,
  planRunsUpdates,
  planStreamBlock,
  readRunsSheet,
} from "../src/sheets/runSheet.js";
import {
  buildStreamUrls,
  fetchLatestYouTubeVodUrl,
  resolveStreamLinks,
} from "../src/core/streamLinks.js";
import { loadConfig } from "../config/config.js";
import { RawCache, SyncStateStore } from "../src/sync/rawCache.js";
import { runSync } from "../src/sync/syncEngine.js";
import { PLAYER, fakeClient, tempDir, testConfig } from "./syncFixtures.js";

const ok = (data) => ({ ok: true, status: 200, json: async () => data });
const quiet = { log() {}, warn() {} };

const sheetConfig = (overrides = {}) => ({
  player: PLAYER,
  startDateIso: "2026-10-03",
  backend: "memory",
  spreadsheetTitle: "test",
  sheetRowCapacity: 2500,
  ...overrides,
});

describe("buildStreamBlockRows", () => {
  it("always writes the heading and only the links that exist", () => {
    const withoutVod = buildStreamBlockRows({
      twitchUrl: "https://twitch.tv/x",
      youtubeUrl: "https://www.youtube.com/@x",
      vodUrl: null,
    });
    assert.deepEqual(withoutVod.map((row) => row[0]), [
      STREAM_BLOCK_LABEL,
      STREAM_LINK_LABELS.twitch,
      STREAM_LINK_LABELS.youtube,
    ]);

    const withoutYouTube = buildStreamBlockRows({
      twitchUrl: "https://twitch.tv/x",
      youtubeUrl: "",
      vodUrl: "https://www.youtube.com/watch?v=abc",
    });
    assert.deepEqual(withoutYouTube.map((row) => row[0]), [
      STREAM_BLOCK_LABEL,
      STREAM_LINK_LABELS.twitch,
      STREAM_LINK_LABELS.vod,
    ]);
  });
});

describe("planStreamBlock", () => {
  it("sits directly below the records and pads rows to full width", () => {
    const rows = buildStreamBlockRows({ twitchUrl: "https://twitch.tv/x" });
    const { clear, write } = planStreamBlock({ recordCount: 6, rows });

    assert.equal(clear, null);
    assert.equal(write.range, `Runs!A8:${LAST_COLUMN_LETTER}9`); // rows 2..7 = records, block from row 8
    assert.equal(write.values.length, 2);
    for (const row of write.values) {
      assert.equal(row.length, COLUMN_COUNT);
    }
    assert.equal(write.values[0][0], STREAM_BLOCK_LABEL);
    assert.equal(write.values[1][1], "https://twitch.tv/x");
  });

  it("clears the previous block when it moves, and skips when identical", () => {
    const rows = buildStreamBlockRows({
      twitchUrl: "https://twitch.tv/x",
      youtubeUrl: "https://www.youtube.com/@x",
    });
    const previousBlock = { startRow: 8, rowCount: 3 };

    const moved = planStreamBlock({ recordCount: 7, previousBlock, rows });
    assert.equal(moved.clear.range, `Runs!A8:${LAST_COLUMN_LETTER}10`);
    assert.equal(moved.write.range, `Runs!A9:${LAST_COLUMN_LETTER}11`);

    const same = planStreamBlock({ recordCount: 6, previousBlock, rows });
    assert.equal(same.clear, null);
    assert.equal(same.write.range, `Runs!A8:${LAST_COLUMN_LETTER}10`);
  });

  it("emits only a clear when all links are gone", () => {
    const { clear, write } = planStreamBlock({
      recordCount: 3,
      previousBlock: { startRow: 5, rowCount: 3 },
      rows: [],
    });
    assert.equal(write, null);
    assert.equal(clear.range, `Runs!A5:${LAST_COLUMN_LETTER}7`);
    assert.equal(clear.values[0].length, COLUMN_COUNT);
  });

  it("surfaces the block plan through planRunsUpdates", () => {
    const rows = buildStreamBlockRows({ twitchUrl: "https://twitch.tv/x" });
    const plan = planRunsUpdates({
      records: [],
      existingRows: [],
      streamRows: rows,
      previousStreamBlock: { startRow: 5, rowCount: 3 },
    });
    assert.equal(plan.streamClear.range, `Runs!A5:${LAST_COLUMN_LETTER}7`);
    assert.equal(plan.streamWrite.range, `Runs!A2:${LAST_COLUMN_LETTER}3`);
  });
});

describe("readRunsSheet with a stream block", () => {
  it("keeps the block out of dataRows/records and reports its position", async () => {
    const backend = new MemoryBackend();
    await initializeSheets({ backend, config: sheetConfig() });

    const { dataRows, records, streamBlock } = await readRunsSheet({ backend });
    assert.deepEqual(dataRows, []);
    assert.deepEqual(records, []);
    // Heading + Twitch + YouTube (no API key => no VOD row), starting at row 2.
    assert.deepEqual(streamBlock, { startRow: 2, rowCount: 3 });

    const values = await backend.readValues("Runs!A2:B4");
    assert.equal(values[0][0], STREAM_BLOCK_LABEL);
    assert.equal(values[1][0], STREAM_LINK_LABELS.twitch);
    assert.match(values[1][1], /^https:\/\/twitch\.tv\//);
    assert.equal(values[2][0], STREAM_LINK_LABELS.youtube);
    assert.match(values[2][1], /^https:\/\/www\.youtube\.com\//);
  });

  it("stays idempotent when initializeSheets re-runs", async () => {
    const backend = new MemoryBackend();
    await initializeSheets({ backend, config: sheetConfig() });
    const first = await readRunsSheet({ backend });
    await initializeSheets({ backend, config: sheetConfig() });
    const second = await readRunsSheet({ backend });
    assert.deepEqual(second.streamBlock, first.streamBlock);
  });
});


describe("stream link helpers", () => {
  it("builds canonical URLs and accepts handles with or without @", () => {
    assert.deepEqual(buildStreamUrls({ twitchHandle: "@AwenRuns", youtubeHandle: "AwenRuns" }), {
      twitchUrl: "https://twitch.tv/AwenRuns",
      youtubeUrl: "https://www.youtube.com/@AwenRuns",
    });
    assert.deepEqual(buildStreamUrls({}), { twitchUrl: "", youtubeUrl: "" });
  });

  it("walks channels.list -> playlistItems.list to the latest upload", async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(url);
      if (url.includes("/channels?")) {
        return ok({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU123" } } }] });
      }
      return ok({ items: [{ contentDetails: { videoId: "vid9" } }] });
    };

    const url = await fetchLatestYouTubeVodUrl({
      apiKey: "key",
      handle: "@AwenRuns",
      fetchImpl,
    });
    assert.equal(url, "https://www.youtube.com/watch?v=vid9");
    assert.equal(calls.length, 2);
    assert.ok(calls[0].includes("forHandle=@AwenRuns"));
    assert.ok(calls[1].includes("playlistId=UU123"));
    assert.ok(calls[1].includes("maxResults=1"));
  });

  it("is best-effort: no key means no network, errors mean null", async () => {
    let called = 0;
    const noKey = await fetchLatestYouTubeVodUrl({
      apiKey: "",
      handle: "x",
      fetchImpl: async () => {
        called += 1;
        return ok({});
      },
    });
    assert.equal(noKey, null);
    assert.equal(called, 0);

    const failure = await fetchLatestYouTubeVodUrl({
      apiKey: "key",
      handle: "x",
      fetchImpl: async () => ({ ok: false, status: 403 }),
      logger: { warn() {} },
    });
    assert.equal(failure, null);
  });

  it("resolveStreamLinks falls back to the player and only looks up with a key", async () => {
    const withoutKey = await resolveStreamLinks({ player: PLAYER });
    assert.equal(withoutKey.twitchUrl, `https://twitch.tv/${PLAYER}`);
    assert.equal(withoutKey.youtubeUrl, `https://www.youtube.com/@${PLAYER}`);
    assert.equal(withoutKey.vodUrl, null);

    const withKey = await resolveStreamLinks({
      stream: { youtubeApiKey: "key", twitchHandle: "T", youtubeHandle: "Y" },
      fetchImpl: async (url) =>
        url.includes("/channels?")
          ? ok({ items: [{ contentDetails: { relatedPlaylists: { uploads: "UU" } } }] })
          : ok({ items: [{ contentDetails: { videoId: "v" } }] }),
    });
    assert.equal(withKey.vodUrl, "https://www.youtube.com/watch?v=v");
    assert.equal(withKey.twitchUrl, "https://twitch.tv/T");
  });
});

describe("dashboard stream segment", () => {
  it("sits below the chart and links the Runs block via shared labels", () => {
    const dashboard = dashboardBuild({ capacity: 2500 });
    const lastChartRow = dashboard.chartFirstRow + dashboard.chartRowCapacity - 1;
    assert.equal(dashboard.streamHeaderRow, lastChartRow + 2); // one blank row
    assert.equal(dashboard.streamValueRow, dashboard.streamHeaderRow + 1);
    assert.deepEqual(dashboard.streamHeader, [
      "Stream",
      STREAM_LINK_LABELS.twitch,
      STREAM_LINK_LABELS.youtube,
      STREAM_LINK_LABELS.vod,
    ]);
    assert.equal(dashboard.streamValues[0], "");
    for (const formula of dashboard.streamValues.slice(1)) {
      assert.ok(formula.includes("HYPERLINK"), formula);
      assert.ok(formula.includes("INDEX(Runs!$B:$B"), formula);
      assert.ok(formula.includes("MATCH("), formula);
    }
  });
});

describe("config stream settings", () => {
  it("defaults handles to MCSR_PLAYER and honours overrides", () => {
    const base = loadConfig({ env: { START_DATE: "2026-10-03" }, rootDir: "/tmp/x" });
    assert.equal(base.stream.twitchHandle, "AwenRuns");
    assert.equal(base.stream.youtubeHandle, "AwenRuns");
    assert.equal(base.stream.youtubeApiKey, "");

    const custom = loadConfig({
      env: { MCSR_PLAYER: "Foo", TWITCH_HANDLE: "@Bar", YOUTUBE_API_KEY: "k" },
      rootDir: "/tmp/x",
    });
    assert.equal(custom.stream.twitchHandle, "@Bar");
    assert.equal(custom.stream.youtubeHandle, "Foo");
    assert.equal(custom.stream.youtubeApiKey, "k");
  });
});

describe("runSync writes the stream block", () => {
  it("places it below the last run row without polluting the records", async () => {
    const dir = tempDir();
    const backend = new MemoryBackend();
    const summary = await runSync({
      config: testConfig(dir),
      backend,
      client: fakeClient(),
      cache: new RawCache({ dir }),
      state: new SyncStateStore({ dir }),
      mode: "initial",
      logger: quiet,
    });
    assert.equal(summary.totalMatches, 6);

    const { records, dataRows, streamBlock } = await readRunsSheet({ backend });
    assert.equal(records.length, 6);
    assert.equal(dataRows.length, 6);
    // 6 record rows (2..7) => block from row 8; no API key => no VOD row.
    assert.deepEqual(streamBlock, { startRow: 8, rowCount: 3 });

    const values = await backend.readValues("Runs!A8:B10");
    assert.equal(values[0][0], STREAM_BLOCK_LABEL);
    assert.equal(values[1][0], STREAM_LINK_LABELS.twitch);
    assert.match(values[1][1], /^https:\/\/twitch\.tv\//);

    // A second sync keeps exactly one block (clear + rewrite, no duplicates).
    await runSync({
      config: testConfig(dir),
      backend,
      client: fakeClient(),
      cache: new RawCache({ dir }),
      state: new SyncStateStore({ dir }),
      mode: "incremental",
      logger: quiet,
    });
    const again = await readRunsSheet({ backend });
    assert.deepEqual(again.streamBlock, { startRow: 8, rowCount: 3 });
    assert.equal(again.dataRows.length, 6);
  });
});
