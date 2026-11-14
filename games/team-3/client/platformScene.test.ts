import { Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { RenderPlayer } from "./renderPlayer.ts";
import { buildPlatformScene, fitCameraToPlatform } from "./platformScene.ts";
import { PLAYER_COLORS } from "./trainScene.ts";

const labelFactory = (name: string): Object3D => {
  const label = new Object3D();
  label.name = `label-${name}`;
  label.userData = { kind: "label", name };
  return label;
};

const players: RenderPlayer[] = [
  { id: "a", name: "Ada", position: { x: -60, y: 10 } },
  { id: "b", name: "Bela", position: { x: 20, y: 10 } },
];

const build = (crew: RenderPlayer[] = players) => buildPlatformScene(crew, { labelFactory });

describe("the platform scene", () => {
  it("draws the floor, the walls and the platform objects", () => {
    const platform = build();
    const children = platform.mapGroup.children;
    expect(children.filter((child) => child.userData.kind === "platformFloor")).toHaveLength(1);
    expect(children.filter((child) => child.userData.kind === "wall")).toHaveLength(4);
    expect(children.filter((child) => child.userData.kind === "platformTrain")).toHaveLength(1);
    expect(children.filter((child) => child.userData.kind === "platformTrainDoor")).toHaveLength(2);

    const objects = children.filter((child) => child.userData.kind === "platformObject");
    expect(objects.map((object) => object.userData.objectName).sort()).toEqual([
      "board 1",
      "board 2",
      "boiler",
      "breach",
      "coal pile",
      "departure lever",
      "wrench",
    ]);
  });

  it("puts the camera above the platform, looking down at an angle", () => {
    const platform = build();
    expect(platform.camera.position.y).toBeGreaterThan(0);
    const direction = new Vector3();
    platform.camera.getWorldDirection(direction);
    expect(direction.y).toBeLessThan(-0.5);
  });

  it("keeps the whole platform in view", () => {
    const platform = build();
    fitCameraToPlatform(platform.camera, platform.map, 16 / 9);
    const { floor } = platform.map;
    for (const dx of [-0.5, 0.5]) {
      for (const dz of [-0.5, 0.5]) {
        const corner = new Vector3(floor.x + dx * floor.width, 0, floor.y + dz * floor.depth).project(
          platform.camera,
        );
        expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("draws each player with a distinct colour, a name and their position", () => {
    const platform = build();
    expect(platform.playersGroup.children).toHaveLength(2);

    const colours = platform.playersGroup.children.map((group) => {
      const body = group.children.find((child) => child.userData.kind === "playerBody");
      expect(body).toBeInstanceOf(Mesh);
      return new Color(((body as Mesh).material as MeshStandardMaterial).color).getHexString();
    });
    expect(colours).toEqual([PLAYER_COLORS[0], PLAYER_COLORS[1]].map((hex) => hex.replace("#", "")));

    const names = platform.playersGroup.children.map(
      (group) => group.children.find((child) => child.userData.kind === "label")?.userData.name,
    );
    expect(names).toEqual(["Ada", "Bela"]);

    const first = platform.playersGroup.children[0];
    expect(first?.position.x).toBe(-60);
    expect(first?.position.z).toBe(10);
  });

  it("replaces the crew when new state arrives, and disposes", () => {
    const platform = build();
    platform.updatePlayers([players[0] as RenderPlayer]);
    expect(platform.playersGroup.children).toHaveLength(1);
    platform.updatePlayers([]);
    expect(platform.playersGroup.children).toHaveLength(0);
    expect(() => platform.dispose()).not.toThrow();
  });
});

describe("updatePlayers keeps what did not change", () => {
  it("moves the same figures and draws no new label when only positions change", () => {
    let labels = 0;
    const platform = buildPlatformScene(players, {
      labelFactory: (name) => {
        labels += 1;
        return labelFactory(name);
      },
    });
    const before = [...platform.playersGroup.children];

    platform.updatePlayers(players.map((player) => ({ ...player, position: { x: player.position.x + 9, y: 3 } })));

    platform.playersGroup.children.forEach((group, index) => expect(group).toBe(before[index]));
    expect(platform.playersGroup.children[0]!.position.x).toBe(-51);
    expect(platform.playersGroup.children[0]!.position.z).toBe(3);
    expect(labels).toBe(players.length);
  });

  it("rebuilds a figure when its name changes", () => {
    const platform = build();
    const [ada, bela] = platform.playersGroup.children;
    platform.updatePlayers([players[0] as RenderPlayer, { ...(players[1] as RenderPlayer), name: "Bella" }]);
    expect(platform.playersGroup.children[0]).toBe(ada);
    expect(platform.playersGroup.children[1]).not.toBe(bela);
  });
});
