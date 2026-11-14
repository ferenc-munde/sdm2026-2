import { Mesh, MeshBasicMaterial } from "three";
import { describe, expect, it } from "vitest";
import { HIGHLIGHT_COLORS } from "./actionHighlight.ts";
import { createHighlightRing, HIGHLIGHT_RADIUS } from "./highlightRing.ts";

describe("the action ring", () => {
  it("starts hidden", () => {
    const ring = createHighlightRing();
    expect(ring.group.visible).toBe(false);
    ring.dispose();
  });

  it("sits just above the floor at the target and takes the tone's colour", () => {
    const ring = createHighlightRing();
    ring.show({ position: { x: 30, y: -40 }, tone: "item" }, 0);
    expect(ring.group.visible).toBe(true);
    expect(ring.group.position.x).toBe(30);
    expect(ring.group.position.z).toBe(-40);
    expect(ring.group.position.y).toBeGreaterThan(6); // above the station pad
    expect(ring.group.position.y).toBeLessThan(10);

    const mesh = ring.group.children[0] as Mesh;
    expect(mesh.geometry).toBeDefined();
    const material = mesh.material as MeshBasicMaterial;
    expect(`#${material.color.getHexString()}`).toBe(HIGHLIGHT_COLORS.item);

    ring.show({ position: { x: 0, y: 0 }, tone: "drop" }, 0);
    expect(`#${material.color.getHexString()}`).toBe(HIGHLIGHT_COLORS.drop);
    ring.dispose();
  });

  it("pulses gently and never disappears", () => {
    const ring = createHighlightRing();
    ring.show({ position: { x: 0, y: 0 }, tone: "station" }, 0);
    const atZero = ring.group.scale.x;
    ring.show({ position: { x: 0, y: 0 }, tone: "station" }, Math.PI / 12); // sin(pi/2) = 1
    expect(ring.group.scale.x).toBeGreaterThan(atZero);
    expect(ring.group.scale.x).toBeGreaterThan(0.8);
    expect(ring.group.scale.x).toBeLessThan(1.2);
    ring.dispose();
  });

  it("hides again when there is no target, and can be disposed", () => {
    const ring = createHighlightRing();
    ring.show({ position: { x: 1, y: 2 }, tone: "lever" }, 0);
    ring.show(null, 0);
    expect(ring.group.visible).toBe(false);
    expect(() => ring.dispose()).not.toThrow();
    expect(HIGHLIGHT_RADIUS).toBeGreaterThan(0);
  });
});
