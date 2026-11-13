import { describe, expect, it } from "vitest";
import { canCreate, canJoin, codeProblem, errorText, nameProblem, normaliseCode, normaliseName } from "./lobbyModel.ts";

describe("name and code", () => {
  it("trims the name", () => {
    expect(normaliseName("  Ada  ")).toBe("Ada");
    expect(normaliseName("   ")).toBe("");
  });

  it("upper-cases the code and keeps only letters and digits", () => {
    expect(normaliseCode("k7qf")).toBe("K7QF");
    expect(normaliseCode(" k7-qf ")).toBe("K7QF");
    expect(normaliseCode("K7QF99")).toBe("K7QF");
  });

  it("explains what is wrong with a name", () => {
    expect(nameProblem("")).toBe("Enter a name first.");
    expect(nameProblem("   ")).toBe("Enter a name first.");
    expect(nameProblem("x".repeat(17))).toContain("16");
    expect(nameProblem("Ada")).toBeNull();
    expect(nameProblem("x".repeat(16))).toBeNull();
  });

  it("explains what is wrong with a code", () => {
    expect(codeProblem("")).toBe("The code is 4 characters.");
    expect(codeProblem("K7Q")).toBe("The code is 4 characters.");
    expect(codeProblem("K7QF")).toBeNull();
    expect(codeProblem("k7qf")).toBeNull();
  });

  it("enables create and join only with a valid form", () => {
    expect(canCreate({ name: "Ada", code: "" })).toBe(true);
    expect(canCreate({ name: " ", code: "" })).toBe(false);
    expect(canJoin({ name: "Ada", code: "K7QF" })).toBe(true);
    expect(canJoin({ name: "Ada", code: "K7" })).toBe(false);
    expect(canJoin({ name: "", code: "K7QF" })).toBe(false);
  });
});

describe("error copy", () => {
  it("has a plain sentence for every error code", () => {
    const codes = ["roomNotFound", "roomFull", "gameInProgress", "invalidName", "invalidMessage", "notHost"] as const;
    for (const code of codes) {
      const text = errorText(code);
      expect(text.length).toBeGreaterThan(10);
      expect(text).not.toContain(code);
    }
  });
});


