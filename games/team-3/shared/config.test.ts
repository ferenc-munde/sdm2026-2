import { describe, expect, it } from "vitest";
import { MIN_PLAYERS, roomSettings, validateRoomSettings } from "./config";
import { GAME_ID, GAME_TITLE } from "./index";

describe("game identity", () => {
  it("uses the team folder name as the game id", () => {
    expect(GAME_ID).toBe("team-3");
    expect(GAME_TITLE).toBe("The Last Train");
  });
});

describe("room settings", () => {
  it("config/game.json is valid", () => {
    expect(validateRoomSettings(roomSettings)).toEqual([]);
  });

  it("allows a crew of two to four players", () => {
    expect(MIN_PLAYERS).toBe(2);
    expect(roomSettings.maxPlayers).toBe(4);
  });

  it("rejects settings that cannot run a room", () => {
    expect(validateRoomSettings({ ...roomSettings, tickRate: 0 })).toContain("tickRate must be a positive integer");
    expect(validateRoomSettings({ ...roomSettings, maxPlayers: 1 })).toContain("maxPlayers must be at least 2");
    expect(validateRoomSettings({ ...roomSettings, patchRate: 60 })).toContain(
      "patchRate must not be higher than tickRate",
    );
    expect(validateRoomSettings({ ...roomSettings, reconnectSeconds: 1.5 })).toContain(
      "reconnectSeconds must be a positive integer",
    );
  });
});
