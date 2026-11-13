import { describe, expect, it } from "vitest";
import { buildRoomLink, joinErrorText, parseRoomLink } from "./roomLinks.ts";

describe("shared room links", () => {
  it("parses the shared code without asking the friend to type it", () => {
    expect(parseRoomLink("http://localhost:5173/?room=k7qf")).toEqual({ kind: "room", code: "K7QF" });
    expect(parseRoomLink("https://game.example/team-3/?room=K7QF")).toEqual({ kind: "room", code: "K7QF" });
  });
  it("distinguishes no link from empty, malformed and ambiguous links", () => {
    expect(parseRoomLink("https://game.example/team-3/")).toEqual({ kind: "none" });
    for (const suffix of ["?room=", "?room=abc", "?room=AAAAA", "?room=%3Cxx%3E", "?room=AAAA&room=BBBB"]) {
      expect(parseRoomLink(`https://game.example/${suffix}`)).toEqual({ kind: "invalid" });
    }
    expect(parseRoomLink("not a URL")).toEqual({ kind: "invalid" });
  });
  it("builds from the current page path and replaces an old code", () => {
    expect(buildRoomLink("http://localhost:5173/?room=AAAA#help", "K7QF")).toBe("http://localhost:5173/?room=K7QF");
    expect(buildRoomLink("https://game.example/team-3/?theme=night&room=AAAA", "k7qf")).toBe("https://game.example/team-3/?theme=night&room=K7QF");
    expect(() => buildRoomLink("https://game.example/", "BAD!")).toThrow("Invalid room code");
  });
  it("round trips a share link locally and under a deployment prefix", () => {
    for (const address of ["http://localhost:5173/", "https://game.example/team-3/"]) {
      expect(parseRoomLink(buildRoomLink(address, "K7QF"))).toEqual({ kind: "room", code: "K7QF" });
    }
  });
  it("explains an expired room and other server rejections", () => {
    expect(joinErrorText("roomNotFound")).toContain("expired");
    expect(joinErrorText("roomFull")).toContain("full");
    expect(joinErrorText("gameInProgress")).toContain("departed");
    expect(joinErrorText("unavailable")).toContain("main menu");
  });
});
