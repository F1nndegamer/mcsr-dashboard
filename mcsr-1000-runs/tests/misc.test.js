import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { dashboardBuild } from "../src/sheets/dashboard.js";
import { dashboardFormatRequests } from "../src/sheets/dashboardFormatting.js";
import { loadConfig, parseStartDate } from "../config/config.js";
import { formatEndTowers, humaniseToken, mapBastionType, mapSeedType } from "../src/mcsr/seed.js";
import { GoogleAuthError, createTokenProvider, getAccessToken } from "../src/sheets/googleAuth.js";
import { McsrApiClient, McsrApiError, planSeasons } from "../src/mcsr/adapter.js";
import { GoogleSheetsBackend, SheetsApiError } from "../src/sheets/googleSheets.js";

describe("dashboard", () => {
  it("covers the required stats and wires the chart row capacity", () => {
    const dashboard = dashboardBuild({ capacity: 2500 });
    const labels = dashboard.grid.map((row) => row[0]);
    for (const required of [
      "Completed Runs / 1000",
      "Progress %",
      "Total Matches",
      "Wins",
      "Losses",
      "Draws",
      "Forfeits",
      "PB",
      "Average Final Time",
      "Median Final Time",
    ]) {
      assert.ok(labels.includes(required), `missing dashboard stat: ${required}`);
    }
    assert.ok(dashboard.chartRowCapacity >= 2000);
    assert.ok(dashboard.chartColumns.rollingAverage(dashboard.chartFirstRow).includes("AVERAGEIFS"));
    assert.ok(dashboard.chartColumns.progressivePb(dashboard.chartFirstRow).includes("MINIFS"));
    assert.ok(dashboardFormatRequests({ sheetId: 0, dashboard }).length > 0);
  });

  it("never divides by zero without a guard", () => {
    const dashboard = dashboardBuild({ capacity: 2500 });
    const progress = dashboard.grid.find((row) => row[0] === "Progress %")[1];
    assert.ok(progress.includes("IFERROR"));
  });

  it("adds the X / 1000 hero, progress bar and schema-derived letters", () => {
    const dashboard = dashboardBuild({ capacity: 2500 });
    const row = (label) => dashboard.grid.find((entry) => entry[0] === label);

    // Focal point: "X / 1000 Runs" text plus a REPT progress bar.
    const progress = row("Progress")[1];
    assert.ok(progress.includes("1000 Runs"), progress);
    assert.ok(progress.includes("IFERROR"));
    const bar = row("Progress Bar")[1];
    assert.ok(bar.includes("REPT"), bar);
    assert.ok(dashboard.progressRow > 0);
    assert.equal(dashboard.progressBarRow, dashboard.progressRow + 1);

    // Formulas follow the schema (Final Time = S, Data Status = Z).
    assert.ok(row("PB")[1].includes("Runs!$S$2:$S"), "PB must reference Final Time (column S)");
    assert.ok(
      row("Rows still needing input")[1].includes("Runs!$Z$2:$Z"),
      "must reference Data Status (column Z)",
    );
    assert.ok(row("Wins")[1].includes("Runs!$G$2:$G"));
  });
});

describe("config", () => {
  it("defaults to AwenRuns with the documented START_DATE", () => {
    const config = loadConfig({ env: { START_DATE: "2026-10-03" }, rootDir: "/tmp/x" });
    assert.equal(config.player, "AwenRuns");
    assert.equal(config.startDateIso, "2026-10-03");
    assert.ok(typeof config.startDateMs === "number");
  });

  it("rejects a non-ISO START_DATE", () => {
    assert.throws(() => parseStartDate("03-10-2026"), /START_DATE/);
    assert.equal(parseStartDate(""), null);
  });
});

describe("seed mappings", () => {
  it("maps the four bastion types and humanises anything new", () => {
    assert.equal(mapBastionType("TREASURE"), "Treasure");
    assert.equal(mapBastionType("housing"), "Housing");
    assert.equal(mapBastionType("BRIDGE"), "Bridge");
    assert.equal(mapBastionType("stables"), "Stables");
    const warnings = [];
    assert.equal(mapBastionType("FUTURE_BASTION", { warnings }), "Future Bastion");
    assert.equal(warnings.length, 1);
    assert.equal(mapSeedType("DESERT_TEMPLE"), "Desert Temple");
    assert.equal(humaniseToken("BURIED_TREASURE"), "Buried Treasure");
  });

  it("formats End towers compactly without losing the raw array", () => {
    assert.equal(formatEndTowers([79, 88, 91, 103]), "79/88/91/103");
    assert.equal(formatEndTowers([]), "");
    assert.equal(formatEndTowers(null), "");
  });
});

describe("failure handling", () => {
  const okJson = (data, status = 200) => ({
    status,
    ok: status >= 200 && status < 300,
    headers: { get: () => null },
    json: async () => ({ status: "success", data }),
    text: async () => JSON.stringify({ status: "success", data }),
  });

  it("retries HTTP 429 with backoff and then succeeds", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return { status: 429, ok: false, headers: { get: () => null }, text: async () => "slow down" };
      }
      return okJson({ uuid: "u", nickname: "AwenRuns" });
    };
    const client = new McsrApiClient({ fetchImpl, sleep: async () => {}, logger: { warn() {} } });
    const user = await client.getUser("AwenRuns");
    assert.equal(user.nickname, "AwenRuns");
    assert.equal(calls, 2);
  });

  it("surfaces API errors without retrying 4xx", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        status: 404,
        ok: false,
        headers: { get: () => null },
        text: async () => JSON.stringify({ status: "error", data: "not found" }),
        json: async () => ({ status: "error", data: "not found" }),
      };
    };
    const client = new McsrApiClient({ fetchImpl, sleep: async () => {}, logger: { warn() {} } });
    await assert.rejects(() => client.getUser("Nobody"), McsrApiError);
    assert.equal(calls, 1);
  });

  it("stops paginating when the API cursor stalls", async () => {
    const page = [{ id: 5 }, { id: 5 }];
    const client = new McsrApiClient({ logger: { warn() {} } });
    client.listUserMatches = async () => page;
    const matches = await client.fetchSeasonMatches({ identifier: "AwenRuns", season: 9 });
    assert.equal(matches.length, 2);
  });

  it("planSeasons walks back to the season covering START_DATE", async () => {
    const client = {
      async fetchSeasonInfo(season) {
        if (season === undefined) return { number: 10, startsAt: Date.UTC(2026, 8, 1) / 1000 };
        const starts = { 10: Date.UTC(2026, 8, 1), 9: Date.UTC(2026, 6, 1), 8: Date.UTC(2026, 4, 1) };
        return { number: season, startsAt: starts[season] / 1000 };
      },
    };
    // START_DATE (Oct 3) sits inside season 10, so only it is needed ...
    const seasons = await planSeasons({ client, startDateMs: Date.UTC(2026, 9, 3) });
    assert.deepEqual(seasons, [10]);
    // ... while a START_DATE before season 10 began pulls season 9 in too.
    const earlier = await planSeasons({ client, startDateMs: Date.UTC(2026, 7, 15) });
    assert.deepEqual(earlier, [10, 9]);
  });

  it("Google auth fails with an actionable message when unconfigured", async () => {
    await assert.rejects(() => getAccessToken({ google: { mode: "none" } }), GoogleAuthError);
    const provider = createTokenProvider({ google: { mode: "access-token", accessToken: "abc" } });
    assert.equal(await provider(), "abc");
  });

  it("Google Sheets retries 429/5xx and surfaces permission errors", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      if (calls === 1) {
        return { status: 500, ok: false, text: async () => "boom" };
      }
      return { status: 403, ok: false, text: async () => JSON.stringify({ error: { message: "The caller does not have permission" } }) };
    };
    const backend = new GoogleSheetsBackend({
      spreadsheetId: "x",
      tokenProvider: async () => "token",
      fetchImpl,
      sleep: async () => {},
      logger: { warn() {} },
      maxRetries: 2,
    });
    await assert.rejects(() => backend.getSheetMetadata(), SheetsApiError);
    assert.equal(calls, 2);
  });
});