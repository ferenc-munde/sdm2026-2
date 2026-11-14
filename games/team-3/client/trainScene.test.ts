import { Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { RenderPlayer } from "./renderPlayer.ts";
import {
  PLAYER_COLORS,
  buildTrainScene,
  fitCameraToMap,
  mapCentreX,
  type RenderHazard,
  type RenderItem,
  type RenderWorld,
} from "./trainScene.ts";

const labelFactory = (name: string): Object3D => {
  const label = new Object3D();
  label.name = `label-${name}`;
  label.userData = { kind: "label", name };
  return label;
};

const players: RenderPlayer[] = [
  { id: "a", name: "Ada", position: { x: 10, y: 20 } },
  { id: "b", name: "Bela", position: { x: 410, y: -20 } },
];

const items: RenderItem[] = [
  { id: "wrench-1", kind: "wrench", position: { x: 100, y: 30 }, heldBy: null },
  { id: "coal-1", kind: "coal", position: { x: 200, y: -30 }, heldBy: null },
  { id: "ext-1", kind: "extinguisher", position: { x: 0, y: 0 }, heldBy: "a" },
];

const hazards: RenderHazard[] = [
  { id: "fire-1", kind: "fire", position: { x: 300, y: 50 }, progress: 0.5 },
  { id: "breach-1", kind: "breach", position: { x: 600, y: -50 }, progress: 0 },
];

const build = (world: RenderWorld = { players, items, hazards }) => buildTrainScene(world, { labelFactory });

const stations = (group: Object3D): Object3D[] => group.children.filter((child) => child.userData.kind === "station");

describe("the train", () => {
  it("draws the shared map: floors, walls, doors and stations", () => {
    const train = build();
    expect(train.map.cars).toHaveLength(3);
    expect(train.map.stations.map((station) => station.kind).sort()).toEqual([
      "coalDispenser",
      "engine",
      "extinguisherRack",
      "steeringConsole",
      "wrenchRack",
    ]);
    expect(stations(train.mapGroup)).toHaveLength(train.map.stations.length);
    expect(train.mapGroup.children.filter((child) => child.userData.kind === "car")).toHaveLength(3);
    expect(train.mapGroup.children.filter((child) => child.userData.kind === "wall").length).toBeGreaterThan(0);
    expect(train.mapGroup.children.filter((child) => child.userData.kind === "door")).toHaveLength(2);
  });

  it("keeps the train and everything on it in one group, so the hull can roll", () => {
    const train = build();
    expect(train.hullGroup.children).toEqual(
      expect.arrayContaining([train.mapGroup, train.itemsGroup, train.hazardsGroup, train.playersGroup]),
    );
    expect(train.hullGroup.rotation.x).toBe(0);
  });

  it("puts the camera above the train, looking down at an angle", () => {
    const train = build();
    expect(train.camera.position.y).toBeGreaterThan(0);
    expect(train.camera.position.x).toBeCloseTo(mapCentreX(train.map));

    const direction = new Vector3();
    train.camera.getWorldDirection(direction);
    expect(direction.y).toBeLessThan(-0.5);
  });

  it("keeps the whole train inside the viewport", () => {
    const train = build();
    fitCameraToMap(train.camera, train.map, 16 / 9);

    for (const car of train.map.cars) {
      for (const dx of [-0.5, 0.5]) {
        for (const dz of [-0.5, 0.5]) {
          const corner = new Vector3(car.x + dx * car.width, 0, car.y + dz * car.depth).project(train.camera);
          expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("players and items", () => {
  it("gives each player a distinct colour and a name", () => {
    const train = build();
    expect(train.playersGroup.children).toHaveLength(2);

    const colours = train.playersGroup.children.map((group) => {
      const body = group.children.find((child) => child.userData.kind === "playerBody");
      expect(body).toBeInstanceOf(Mesh);
      return new Color(((body as Mesh).material as MeshStandardMaterial).color).getHexString();
    });
    expect(colours).toEqual([PLAYER_COLORS[0], PLAYER_COLORS[1]].map((hex) => hex.replace("#", "")));

    const names = train.playersGroup.children.map(
      (group) => group.children.find((child) => child.userData.kind === "label")?.userData.name,
    );
    expect(names).toEqual(["Ada", "Bela"]);
  });

  it("maps a floor position to the x/z plane", () => {
    const train = build();
    const first = train.playersGroup.children[0];
    expect(first?.position.x).toBe(10);
    expect(first?.position.z).toBe(20);
    expect(first?.position.y).toBe(0);
  });

  it("draws loose items on the floor with their kind", () => {
    const train = build();
    const kinds = train.itemsGroup.children.map((item) => item.userData.itemKind).sort();
    expect(kinds).toEqual(["coal", "wrench"]);
    for (const item of train.itemsGroup.children) {
      expect(item.position.y).toBe(10);
    }
  });

  it("draws a held item with its player, not on the floor", () => {
    const train = build();
    expect(train.itemsGroup.children.map((item) => item.userData.itemId)).not.toContain("ext-1");

    const holder = train.playersGroup.children.find((group) => group.userData.playerId === "a");
    const held = holder?.children.find((child) => child.userData.kind === "heldItem");
    expect(held?.userData.itemId).toBe("ext-1");
    expect(held?.userData.heldBy).toBe("a");
  });
});

describe("hazards and repair progress", () => {
  it("draws every hazard with its repair bar", () => {
    const train = build();
    expect(train.hazardsGroup.children).toHaveLength(2);

    const bar = (id: string): Object3D | undefined =>
      train.hazardsGroup.children
        .find((group) => group.userData.hazardId === id)
        ?.children.find((child) => child.userData.kind === "progressBar");

    expect(bar("fire-1")?.userData.progress).toBe(0.5);
    expect(bar("breach-1")?.userData.progress).toBe(0);
  });

  it("scales the bar fill with the server progress", () => {
    const train = build();
    const fill = (id: string) =>
      train.hazardsGroup.children
        .find((group) => group.userData.hazardId === id)
        ?.children.find((child) => child.userData.kind === "progressBar")
        ?.children.find((child) => child.name === "progressFill");

    expect(fill("fire-1")?.scale.x).toBeCloseTo(0.5);
    expect(fill("breach-1")?.scale.x).toBe(0);

    train.updateState({ players, items, hazards: [{ ...hazards[0]!, progress: 1 }] });
    const updated = fill("fire-1");
    expect(updated?.scale.x).toBe(1);
  });

  it("clamps progress outside 0..1", () => {
    const train = build({
      hazards: [
        { id: "h", kind: "fire", position: { x: 0, y: 0 }, progress: 4 },
        { id: "j", kind: "fire", position: { x: 0, y: 0 }, progress: -2 },
      ],
    });
    const fills = train.hazardsGroup.children.map(
      (group) =>
        group.children.find((child) => child.userData.kind === "progressBar")?.children.find((c) => c.name === "progressFill")
          ?.scale.x,
    );
    expect(fills).toEqual([1, 0]);
  });
});

describe("updateState", () => {
  it("replaces players, items and hazards when new state arrives", () => {
    const train = build();
    train.updateState({ players: [players[0]!], items: [], hazards: [] });
    expect(train.playersGroup.children).toHaveLength(1);
    expect(train.itemsGroup.children).toHaveLength(0);
    expect(train.hazardsGroup.children).toHaveLength(0);
  });

  it("can be disposed without throwing", () => {
    const train = build();
    expect(() => train.dispose()).not.toThrow();
  });
  it("draws each crew member with a head and turns them to face where they walk (#217)", () => {
    const train = build({ players: [{ id: "a", name: "Ada", position: { x: 0, y: 0 }, facing: { dx: 0, dy: 1 } }] });
    const group = train.playersGroup.children[0]!;
    expect(group.children.some((child) => child.name === "head")).toBe(true);
    expect(group.children.some((child) => child.name === "facing")).toBe(true);
    expect(group.rotation.y).toBeCloseTo(-Math.PI / 2);
  });
});
