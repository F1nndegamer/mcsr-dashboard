# MCSR Ranked 1000 Runs Tracker

Tracks **1000 Minecraft speedruns where the configured player personally
reaches End credits in MCSR Ranked**.

Design:

- The `Runs` sheet is the primary dataset: one row per relevant Ranked match
  (wins, losses, draws and forfeits are all kept).
- Only genuine `WIN`s count toward the 1000. `Run #` is derived, never typed.
- The `Dashboard` sheet is a thin layer of live formulas over `Runs`.
- Spreadsheet code lives behind a backend interface, so Google Sheets can be
  swapped for a local file backend (or an Excel backend later) without
  touching the data model, classifier or timeline parser.
- Raw MCSR API payloads are cached locally under `data/` for future
  reprocessing (e.g. deriving a new split later without re-downloading).

Existing project integration: the MCSR client in
`mcsr-1000-runs/src/mcsr/adapter.js` reuses the constants and pagination
contract from the repository's browser client (`src/api/mcsrApi.js`) and
extends it with season-aware listing, advanced `GET /matches/{id}` support,
the `Private-Key` header and retry/backoff handling.

## Quick start (local, no Google needed)

```bash
cd mcsr-1000-runs
cp .env.example .env.local
MCSR_BACKEND=file npm run sync -- --initial
MCSR_BACKEND=file npm run sync
```

`MCSR_BACKEND=file` persists a JSON mirror of each sheet under `out/sheet/`
plus a `Runs.csv`, so the whole pipeline can be exercised offline.
`MCSR_BACKEND=memory` is a throw-away variant used by the tests.

## Configuration

All settings are environment variables (see `.env.example`). Copy it to
`.env.local` (git-ignored); real environment values always override files.

`MCSR_PLAYER` (default `AwenRuns`); `START_DATE` (`YYYY-MM-DD`, matches
before it are never imported, default `2026-10-03`); `UTC_OFFSET_MINUTES`;
`MCSR_PRIVATE_KEY` (optional, expanded rate limit); `MCSR_BACKEND`
(`google`/`file`/`memory`); `SPREADSHEET_ID` (empty = `init-sheet` creates
one); `SPREADSHEET_TITLE`; `FILE_BACKEND_DIR`; `GOOGLE_CLIENT_ID` /
`GOOGLE_CLIENT_SECRET` / `GOOGLE_REFRESH_TOKEN` (OAuth, recommended);
`GOOGLE_SERVICE_ACCOUNT_JSON` (alternative key path or inline JSON - share
the sheet with the service-account email); `GOOGLE_ACCESS_TOKEN` (one-off
runs); `EXCLUDE_DECAYED` (default `true`); `RECONCILE_DAYS` (default `3`);
`INCREMENTAL_SEASON_LOOKBACK` (default `1`); `SHEET_ROW_CAPACITY`
(default `2500`); `DATA_DIR` (raw cache + sync state, default `data`).

## Google authentication

No credentials ever go into source code. Pick one:

1. **OAuth refresh token (recommended).** Create a *Desktop app* OAuth client
   in Google Cloud Console with the **Google Sheets API** enabled, then mint a
   refresh token once (OAuth playground, scope
   `https://www.googleapis.com/auth/spreadsheets`) and set
   `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REFRESH_TOKEN`.
2. **Service account.** Set `GOOGLE_SERVICE_ACCOUNT_JSON` to the key path (or
   the JSON itself), and share the spreadsheet with the service-account email.
3. **Static access token.** Set `GOOGLE_ACCESS_TOKEN` for a single run.

## Spreadsheet setup and sync

```bash
npm run init-sheet   # creates Runs + Dashboard, or repairs SPREADSHEET_ID
npm run sync:initial # first import: every Ranked match since START_DATE
npm run sync         # later: only new / recently-reconciled matches
npm run sync:dry     # plan only: prints what would change, writes nothing
npm run reset        # dry run: prints exactly what a reset would delete
npm run reset -- --confirm # clear tracked runs + local sync state (below)
npm run probe        # dump recent real matches + normalised records (debug)
npm run timeline-map # print the verified timeline identifier mapping
```

Behaviour: `Match ID` is the dedup key (syncing twice never duplicates rows);
`Match #` is chronological over every imported match while `Run #` only
advances on genuine `WIN`s and is re-derived every sync; API-owned fields are
refreshed but the four manual fields (`Completion Type`, `Deaths`,
`Death Messages`, `Notes`) are **never** overwritten; the `Completion`
column is a generated formula
(`-1 -> One-shot`, `0 -> Zero-cycle`, `1 -> One-cycle`, blank -> blank, else
`Invalid`); raw payloads land in `data/cache/matches/<id>.json` so splits can
be re-derived later with `npm run sync -- --reprocess`.

## Sheet appearance

`npm run init-sheet` applies the full presentation layer (idempotent, safe to
re-run; `sync` never touches formatting):

- The Runs columns are grouped into sections - `IDENTIFICATION`, `RESULT`,
  `OVERWORLD`, `NETHER`, `END`, `FINAL`, `RANKED`, `USER` - shown with
  alternating dark header shading and thin separator borders. There are no
  blank spacer columns.
- Header row and the `Run #`/`Match #` columns stay frozen; every column has a
  reading-width pixel size; data cells are centre- or left-aligned by type and
  durations render as `[mm]:ss.000`.
- Conditional formatting (green/red/amber/purple/blue on a soft palette, in
  strict priority order): `Result` colours, `Counts Toward 1000`, a `Run #`
  accent, a subtle green-to-warm color scale on `Final Time` (fastest wins,
  no rainbow), `Deaths` 1+, the `Completion` labels, Elo gains/losses and
  `Data Status` - with a nearly invisible alternating-row tint registered last
  so semantic colours always win.
- The Dashboard leads with a `X / 1000 Runs` hero plus a progress bar, then
  W/L/D/Forfeit counts (colour-accented), completion % and the timing stats.

## Reset

```bash
npm run reset                 # dry run: lists what would be deleted
npm run reset -- --confirm    # actually do it
```

`reset` restores a fresh-install state. It clears only the known tracker
ranges (`Runs!A2:AB<capacity>` data rows and the Dashboard grid - header,
formatting, filters and frozen panes are re-applied afterwards) and deletes
only allow-listed local artefacts: `data/cache/`, `data/logs/`,
`data/sync-state.json`, `data/normalized-records.json` and the file-backend
mirror under `out/sheet/` (`Runs.json`, `Dashboard.json`,
`spreadsheet-requests.json`, `Runs.csv`). It **never** touches `.env`,
`.env.local`, Google/OAuth credentials, source code, or deletes the
spreadsheet itself. Without `--confirm` nothing is changed - the command only
prints the plan and exits non-zero.

## Discovered MCSR timeline identifiers

Verified against live `GET https://api.mcsrranked.com/matches/{id}`
responses (`npm run probe -- --count 5` prints real examples). The API
returns Minecraft advancement ids plus two ProjectElo custom ids:

- `NETHER_ENTER` = `story.enter_the_nether`
- `BASTION_ENTER` = `nether.find_bastion`
- `FORTRESS_ENTER` = `nether.find_fortress`
- `BLIND` = `projectelo.timeline.blind_travel`
- `STRONGHOLD_ENTER` = `story.follow_ender_eye` (no dedicated stronghold
  advancement exists; also what the repo's dashboard uses for this phase)
- `END_ENTER` = `story.enter_the_end`
- `COMPLETE` = the `completions[]` record (authoritative; preferred over
  `projectelo.timeline.dragon_death`, with `end.kill_dragon` /
  `projectelo.timeline.complete` as aliases)

Splits: `OW = start -> NETHER_ENTER`, `Nether = NETHER_ENTER ->
STRONGHOLD_ENTER`, `Bastion Time = BASTION_ENTER -> FORTRESS_ENTER`,
`End = END_ENTER -> COMPLETE`, `Final = completions[].time`.
Unknown timeline types are written to
`data/logs/unknown-timeline-types.txt`, never silently dropped.

Other API findings: `seed.id` is the MCSR **filtered seed id** (never the
numeric Minecraft seed - neither endpoint exposes it, so the model keeps
`seedId` vs `minecraftSeed: null` explicit); `seed.overworld` is the
structure classification (`VILLAGE`, ...), `seed.nether` is the bastion type
(`TREASURE`, `HOUSING`, `BRIDGE`, `STABLES`), `seed.endTowers` holds the four
zero-relevant tower heights; Elo comes from `changes[]` (`eloRate` +
`change`); and `forfeited: true` with `result.uuid` set to the tracked player
still means `FORFEIT`.

## Tests

```bash
cd mcsr-1000-runs
npm test
```

Covers: WIN/LOSS/DRAW/FORFEIT classification incl. the opponent-forfeit edge
case; `WIN/LOSS/FORFEIT/DRAW/WIN/WIN -> Run # 1,blank,blank,blank,2,3`;
duplicate-safe double sync; manual-field preservation; completion mapping;
timeline identifiers and split math; data-status rules; dashboard formulas
(including the schema-derived column letters); the Runs-sheet presentation
requests (sections, borders, freeze, conditional formatting); reset dry-run
and confirm behaviour incl. `.env.local` preservation; retry/backoff and
auth-error handling.

