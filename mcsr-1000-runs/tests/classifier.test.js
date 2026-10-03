import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyMatch, classifyResult } from "../src/core/classifier.js";

const PLAYER = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OPPONENT = "ffffffff-1111-2222-3333-444444444444";

describe("classifyMatch", () => {
  it("WIN: tracked player reaches credits normally", () => {
    const out = classifyMatch({
      forfeited: false,
      winnerUuid: PLAYER,
      playerUuid: PLAYER,
      opponentUuid: OPPONENT,
    });
    assert.equal(out.result, "WIN");
    assert.equal(out.countsToward1000, true);
  });

  it("LOSS: opponent reaches credits", () => {
    const out = classifyMatch({
      forfeited: false,
      winnerUuid: OPPONENT,
      playerUuid: PLAYER,
      opponentUuid: OPPONENT,
    });
    assert.equal(out.result, "LOSS");
    assert.equal(out.countsToward1000, false);
  });

  it("DRAW: no winner recorded", () => {
    for (const winnerUuid of [null, undefined, ""]) {
      const out = classifyMatch({
        forfeited: false,
        winnerUuid,
        playerUuid: PLAYER,
        opponentUuid: OPPONENT,
      });
      assert.equal(out.result, "DRAW");
      assert.equal(out.countsToward1000, false);
    }
  });

  it("FORFEIT: opponent forfeits but API still credits the tracked player", () => {
    const out = classifyMatch({
      forfeited: true,
      winnerUuid: PLAYER,
      playerUuid: PLAYER,
      opponentUuid: OPPONENT,
    });
    assert.equal(out.result, "FORFEIT");
    assert.equal(out.countsToward1000, false);
  });

  it("FORFEIT: tracked player forfeits while opponent is the recorded winner", () => {
    const out = classifyMatch({
      forfeited: true,
      winnerUuid: OPPONENT,
      playerUuid: PLAYER,
      opponentUuid: OPPONENT,
    });
    assert.equal(out.result, "FORFEIT");
    assert.equal(out.countsToward1000, false);
  });

  it("DRAW with a warning when the winner matches neither player", () => {
    const out = classifyMatch({
      forfeited: false,
      winnerUuid: "some-third-uuid",
      playerUuid: PLAYER,
      opponentUuid: OPPONENT,
    });
    assert.equal(out.result, "DRAW");
    assert.equal(out.countsToward1000, false);
    assert.ok(out.warnings.length > 0);
  });

  it("classifyResult returns just the result string", () => {
    assert.equal(
      classifyResult({ forfeited: false, winnerUuid: PLAYER, playerUuid: PLAYER }),
      "WIN",
    );
  });
});
