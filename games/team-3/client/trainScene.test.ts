import { Color, Mesh, MeshStandardMaterial, Object3D, Vector3 } from "three";
import { describe, expect, it } from "vitest";
import type { RenderPlayer } from "./renderPlayer.ts";
import { PLAYER_COLORS, buildTrainScene, fitCameraToMap, mapCentreX } from "./trainScene.ts";

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

const build = (crew: RenderPlayer[] = players) =>
  buildTrainScene(crew, { labelFactory });

describe("buildTrainScene", () => {
  it("draws every car, wall and door of the map", () => {
    const train = build();
    const drawn = train.mapGroup.children;
    expect(drawn).toHaveLength(train.map.cars.length + train.map.walls.length + train.map.doors.length);
    expect(drawn.filter((mesh) => mesh.userData.kind === "car")).toHaveLength(train.map.cars.length);
    expect(drawn.filter((mesh) => mesh.userData.kind === "wall")).toHaveLength(train.map.walls.length);
    expect(drawn.filter((mesh) => mesh.userData.kind === "door")).toHaveLength(train.map.doors.length);
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
          const corner = new Vector3(car.x + dx * car.width, 0, car.z + dz * car.depth).project(
            train.camera,
          );
          expect(Math.abs(corner.x)).toBeLessThanOrEqual(1);
          expect(Math.abs(corner.y)).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("gives each player a distinct colour", () => {
    const train = build();
    expect(train.playersGroup.children).toHaveLength(2);

    const colours = train.playersGroup.children.map((group) => {
      const body = group.children.find((child) => child.userData.kind === "playerBody");
      expect(body).toBeInstanceOf(Mesh);
      const material = (body as Mesh).material as MeshStandardMaterial;
      return new Color(material.color).getHexString();
    });

    expect(colours).toEqual([PLAYER_COLORS[0], PLAYER_COLORS[1]].map((hex) => hex.replace("#", "")));
    expect(new Set(colours).size).toBe(2);
  });

  it("adds a name label above each player", () => {
    const train = build();
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

  it("replaces the figures when a new state arrives", () => {
    const train = build();
    train.updatePlayers([players[0] as RenderPlayer]);
    expect(train.playersGroup.children).toHaveLength(1);

    train.updatePlayers([]);
    expect(train.playersGroup.children).toHaveLength(0);
  });

  it("can be disposed without throwing", () => {
    const train = build();
    expect(() => train.dispose()).not.toThrow();
  });
});
