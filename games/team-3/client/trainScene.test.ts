import { LOCOMOTIVE_LENGTH } from "./trainModel.ts";
import { Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import { CARRY_ARM_LIFT, INTERACT_ARM_LIFT } from "./crewPose.ts";
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
    // Centred on the cars plus the locomotive in front of them (visual pass).
    expect(train.camera.position.x).toBeCloseTo(mapCentreX(train.map) - (LOCOMOTIVE_LENGTH + 50) / 2);

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
      let body: Object3D | undefined;
      group.traverse((child) => { if (child.userData.kind === "playerBody") body = child; });
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

  it("gives a breach rising steam and flickers a fire (#217)", () => {
    const train = build({
      hazards: [
        { id: "b", kind: "breach", position: { x: 0, y: 0 }, progress: 0 },
        { id: "f", kind: "fire", position: { x: 100, y: 0 }, progress: 0 },
      ],
    });

    const breach = train.hazardsGroup.children.find((group) => group.userData.hazardId === "b");
    const steam = breach?.children.filter((child) => child.userData.kind === "steam") ?? [];
    expect(steam).toHaveLength(4);

    train.updateEffects(0.1);
    const early = steam[0]?.position.y;
    train.updateEffects(0.9);
    expect(steam[0]?.position.y).not.toBe(early);

    const fire = train.hazardsGroup.children.find((group) => group.userData.hazardId === "f");
    const flame = fire?.children.find((child) => child.name === "fire");
    train.updateEffects(0.2);
    const firstScale = flame?.scale.x;
    train.updateEffects(0.5);
    expect(flame?.scale.x).not.toBe(firstScale);
  });

  it("can be disposed without throwing", () => {
    const train = build();
    expect(() => train.dispose()).not.toThrow();
  });
  it("draws each crew member with a head and turns them to face where they walk (#217)", () => {
    const train = build({ players: [{ id: "a", name: "Ada", position: { x: 0, y: 0 }, facing: { dx: 0, dy: 1 } }] });
    const group = train.playersGroup.children[0]!;
    expect(group.getObjectByName("head")).toBeDefined();
    expect(group.getObjectByName("facing")).toBeDefined();
    expect(group.rotation.y).toBeCloseTo(-Math.PI / 2);
  });
});

describe("updateState keeps what did not change", () => {
  const counting = () => {
    let labels = 0;
    const factory = (name: string): Object3D => {
      labels += 1;
      return labelFactory(name);
    };
    const train = buildTrainScene({ players, items, hazards }, { labelFactory: factory });
    return { train, labels: () => labels };
  };

  it("moves the same objects when only positions, facing and progress change", () => {
    const { train, labels } = counting();
    const before = {
      players: [...train.playersGroup.children],
      items: [...train.itemsGroup.children],
      hazards: [...train.hazardsGroup.children],
    };

    train.updateState({
      players: players.map((player) => ({ ...player, position: { x: player.position.x + 5, y: 7 }, facing: { dx: -1, dy: 0 } })),
      items: items.map((item) => ({ ...item, position: { x: item.position.x + 3, y: 4 } })),
      hazards: hazards.map((hazard) => ({ ...hazard, progress: 0.75 })),
    });

    expect(train.playersGroup.children).toEqual(before.players);
    expect(train.itemsGroup.children).toEqual(before.items);
    expect(train.hazardsGroup.children).toEqual(before.hazards);
    train.playersGroup.children.forEach((group, index) => expect(group).toBe(before.players[index]));
    expect(labels()).toBe(players.length); // no name label was drawn again

    const first = train.playersGroup.children[0]!;
    expect(first.position.x).toBe(15);
    expect(first.position.z).toBe(7);
    expect(first.rotation.y).toBeCloseTo(-Math.PI);
    expect(train.itemsGroup.children[0]!.position.x).toBe(103);
    const fill = train.hazardsGroup.children[0]!.children
      .find((child) => child.name === "progress")!
      .children.find((child) => child.name === "progressFill")!;
    expect(fill.scale.x).toBeCloseTo(0.75);
  });

  it("faces +x again when a player stops having a direction", () => {
    const { train } = counting();
    train.updateState({ players: [{ ...players[0]!, facing: { dx: 0, dy: 1 } }], items: [], hazards: [] });
    expect(train.playersGroup.children[0]!.rotation.y).toBeCloseTo(-Math.PI / 2);
    train.updateState({ players: [{ ...players[0]!, facing: { dx: 0, dy: 0 } }], items: [], hazards: [] });
    expect(train.playersGroup.children[0]!.rotation.y).toBe(0);
  });

  it("rebuilds only the player whose name, seat or held item changed", () => {
    const { train, labels } = counting();
    const [ada, bela] = train.playersGroup.children;

    // Bela is renamed: one new figure and one new label; Ada is untouched.
    train.updateState({ players: [players[0]!, { ...players[1]!, name: "Bella" }], items, hazards });
    expect(train.playersGroup.children[0]).toBe(ada);
    expect(train.playersGroup.children[1]).not.toBe(bela);
    expect(train.playersGroup.children[1]!.userData.name).toBe("Bella");
    expect(labels()).toBe(players.length + 1);

    // Ada drops the extinguisher: her figure is rebuilt without the held item, and it is on the floor.
    const dropped = items.map((item) => (item.id === "ext-1" ? { ...item, heldBy: null } : item));
    train.updateState({ players: [players[0]!, { ...players[1]!, name: "Bella" }], items: dropped, hazards });
    expect(train.playersGroup.children[0]).not.toBe(ada);
    expect(train.playersGroup.children[0]!.children.some((child) => child.userData.kind === "heldItem")).toBe(false);
    expect(train.itemsGroup.children.some((child) => child.userData.itemId === "ext-1")).toBe(true);
  });

  it("keeps the figures in seat order when the crew changes, and removes who left", () => {
    const { train } = counting();
    const bela = train.playersGroup.children[1];
    const cy: RenderPlayer = { id: "c", name: "Cy", position: { x: 0, y: 0 } };

    train.updateState({ players: [...players, cy], items: [], hazards: [] });
    expect(train.playersGroup.children.map((group) => group.userData.playerId)).toEqual(["a", "b", "c"]);
    expect(train.playersGroup.children[1]).toBe(bela);

    // Ada leaves: Bela moves up to seat 0, so the colour changes and the figure is rebuilt.
    train.updateState({ players: [players[1]!, cy], items: [], hazards: [] });
    expect(train.playersGroup.children.map((group) => group.userData.playerId)).toEqual(["b", "c"]);
    expect(train.playersGroup.children[0]).not.toBe(bela);
  });
});

describe("crew and wheel animation (#294)", () => {
  const moving = (position: { x: number; y: number }): RenderWorld => ({
    players: [{ id: "a", name: "Ada", position, facing: { dx: 1, dy: 0 } }],
    items: [],
    hazards: [],
  });
  const limbs = (figure: Object3D, kind: string): Object3D[] => {
    const found: Object3D[] = [];
    figure.traverse((child) => {
      if (child.userData.kind === kind) found.push(child);
    });
    return found;
  };

  it("gives every figure two legs and two arms", () => {
    const train = build({ players, items: [], hazards: [] });
    for (const figure of train.playersGroup.children) {
      expect(limbs(figure, "leg")).toHaveLength(2);
      expect(limbs(figure, "arm")).toHaveLength(2);
    }
  });

  it("swings the limbs while moving and settles when the figure stands still", () => {
    const train = build(moving({ x: 0, y: 0 }));
    const figure = train.playersGroup.children[0]!;
    const legs = limbs(figure, "leg");
    const arms = limbs(figure, "arm");

    train.updateMotion(0.1, 1);
    expect(legs.every((leg) => leg.rotation.z === 0)).toBe(true);

    let maxLeg = 0;
    let maxArm = 0;
    for (let frame = 1; frame <= 8; frame += 1) {
      train.updateState(moving({ x: frame * 16, y: 0 }));
      train.updateMotion(0.1, 1);
      for (const leg of legs) maxLeg = Math.max(maxLeg, Math.abs(leg.rotation.z));
      for (const arm of arms) maxArm = Math.max(maxArm, Math.abs(arm.rotation.z));
    }
    expect(maxLeg).toBeGreaterThan(0.05);
    expect(maxArm).toBeGreaterThan(0.02);

    // Standing still for long enough lets the eased speed fall back to zero.
    for (let frame = 0; frame < 40; frame += 1) train.updateMotion(0.1, 1);
    expect(legs.every((leg) => Math.abs(leg.rotation.z) < 1e-6)).toBe(true);
  });

  it("lifts the arms for a carried item, and further while interacting", () => {
    const train = build({
      ...moving({ x: 0, y: 0 }),
      items: [{ id: "c", kind: "coal", position: { x: 0, y: 0 }, heldBy: "a" }],
    });
    const arms = limbs(train.playersGroup.children[0]!, "arm");

    train.updateMotion(0.1, 1);
    for (const arm of arms) expect(arm.rotation.z).toBeCloseTo(CARRY_ARM_LIFT);

    train.updateMotion(0.1, 1, "a");
    for (const arm of arms) expect(arm.rotation.z).toBeCloseTo(INTERACT_ARM_LIFT);
  });

  it("rolls every wheel with the train speed factor", () => {
    const train = build();
    // The bogie wheels from the visual pass: eight under every car, six under the locomotive.
    const wheels = limbs(train.hullGroup, "wheel");
    expect(wheels).toHaveLength(train.map.cars.length * 8 + 6);

    const first = wheels[0]!;
    train.updateMotion(0.5, 1);
    const rolling = first.rotation.y;
    expect(rolling).toBeGreaterThan(0);

    train.updateMotion(0.5, 0);
    expect(first.rotation.y).toBe(rolling);
  });
});
