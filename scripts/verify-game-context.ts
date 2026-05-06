import assert from "node:assert/strict";

import { formatAwayHomeMatchup } from "../src/services/gamePresentation.ts";
import { fetchLiveMLBData } from "../src/services/liveMLBDataService.ts";
import { getTeamAbbreviation } from "../src/services/mlbTeamMetadata.ts";

const data = await fetchLiveMLBData("2026-04-18");
const batters = Object.values(data.batters);

const dansby = batters.find((player) => player.name === "Dansby Swanson");
assert.ok(dansby, "Expected to find Dansby Swanson in the live batter pool");

const metsPlayer = batters.find(
  (player) => player.teamId === "121" && player.gameId === dansby.gameId,
);
assert.ok(metsPlayer, "Expected to find a Mets batter linked to the same game");

const game = data.games.find((candidate) => candidate.id === dansby.gameId);
assert.ok(game, "Expected Dansby Swanson to be linked to an official scheduled game");

const ballpark = game.ballparkId ? data.ballparks[game.ballparkId] : null;
assert.ok(ballpark, "Expected the linked game to have a ballpark record");

const matchupLabel = formatAwayHomeMatchup(game.awayTeamId, game.homeTeamId);

assert.equal(game.id, "824694");
assert.equal(matchupLabel, "NYM @ CHC");
assert.equal(ballpark?.name, "Wrigley Field");
assert.equal(dansby.gameId, game.id);
assert.equal(metsPlayer.gameId, game.id);

console.log(
  JSON.stringify(
    {
      gameId: game.id,
      awayTeam: getTeamAbbreviation(game.awayTeamId),
      homeTeam: getTeamAbbreviation(game.homeTeamId),
      venueName: ballpark?.name ?? null,
      players: [
        {
          playerName: dansby.name,
          playerTeam: getTeamAbbreviation(dansby.teamId),
          matchupLabel,
          venueName: ballpark?.name ?? null,
        },
        {
          playerName: metsPlayer.name,
          playerTeam: getTeamAbbreviation(metsPlayer.teamId),
          matchupLabel,
          venueName: ballpark?.name ?? null,
        },
      ],
    },
    null,
    2,
  ),
);
