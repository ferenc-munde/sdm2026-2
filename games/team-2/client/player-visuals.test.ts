import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MAP_HEIGHT, MAP_WIDTH, PLAYER_RADIUS } from "../shared/map.ts";
import { Player } from "../shared/state.ts";
import { createPlayerVisuals } from "./player-visuals.ts";

function playerAt(x: number, y: number, anim = "idle"): Player {
	const player = new Player();
	player.x = x;
	player.y = y;
	player.anim = anim;
	return player;
}

function namedGroup(parent: THREE.Object3D, name: string): THREE.Group {
	const object = parent.getObjectByName(name);
	if (!(object instanceof THREE.Group)) throw new Error(`Missing group: ${name}`);
	return object;
}

function namedMesh(parent: THREE.Object3D, name: string): THREE.Mesh {
	const object = parent.getObjectByName(name);
	if (!(object instanceof THREE.Mesh)) throw new Error(`Missing mesh: ${name}`);
	return object;
}

function playerGroups(layer: THREE.Group): THREE.Object3D[] {
	return layer.children.filter((child) => child.userData.playerId !== undefined);
}

afterEach(() => {
	vi.restoreAllMocks();
});

describe("player visuals", () => {
	it("creates distinct crew characters with local-player and eliminated styling", () => {
		const layer = new THREE.Group();
		const visuals = createPlayerVisuals(layer);
		const players = new Map([
			["player-1", playerAt(100, 200)],
			["player-2", playerAt(120, 200)],
		]);
		players.get("player-2")!.eliminated = true;

		visuals.update(players, "player-1");

		expect(playerGroups(layer)).toHaveLength(2);
		const first = namedGroup(layer, "player-player-1");
		const second = namedGroup(layer, "player-player-2");
		const firstCharacter = namedGroup(first, "crew-character");
		const secondCharacter = namedGroup(second, "crew-character");
		const firstTorso = namedMesh(firstCharacter, "crew-torso");
		const secondTorso = namedMesh(secondCharacter, "crew-torso");
		expect(firstTorso.geometry).toBeInstanceOf(THREE.CylinderGeometry);
		expect(namedMesh(firstCharacter, "crew-head").geometry).toBeInstanceOf(THREE.SphereGeometry);
		expect(firstCharacter.scale.x).toBeCloseTo(1.68);
		expect(firstCharacter.scale.y).toBeCloseTo(1.68);
		expect(firstCharacter.scale.z).toBeCloseTo(1.68);
		expect(namedGroup(firstCharacter, "left-arm-pivot").getObjectByName("left-arm"))
			.toBeInstanceOf(THREE.Mesh);
		expect(namedMesh(firstCharacter, "left-hand").geometry).toBeInstanceOf(THREE.SphereGeometry);
		expect(namedMesh(firstCharacter, "right-hand").geometry).toBeInstanceOf(THREE.SphereGeometry);
		expect(namedMesh(firstCharacter, "left-leg").geometry).toBeInstanceOf(THREE.CylinderGeometry);
		expect(namedMesh(firstCharacter, "right-leg").geometry).toBeInstanceOf(THREE.CylinderGeometry);
		expect(namedMesh(firstCharacter, "left-foot").geometry).toBeInstanceOf(THREE.BoxGeometry);
		expect(namedMesh(firstCharacter, "right-foot").geometry).toBeInstanceOf(THREE.BoxGeometry);
		expect(firstTorso.material).toBeInstanceOf(THREE.MeshLambertMaterial);
		expect(secondTorso.material).toBeInstanceOf(THREE.MeshLambertMaterial);
		if (!(firstTorso.material instanceof THREE.MeshLambertMaterial)
			|| !(secondTorso.material instanceof THREE.MeshLambertMaterial)) {
			throw new Error("Missing shirt material");
		}
		const highlightedShirt = new THREE.Color("#62cdd3")
			.lerp(new THREE.Color("#ffffff"), 0.35)
			.getHexString();
		expect(firstTorso.material.color.getHexString()).toBe(highlightedShirt);
		expect(secondTorso.material.color.getHexString()).toBe("e46c63");
		expect(first.getObjectByName("player-outline")).toBeUndefined();
		expect(first.getObjectByName("player-activity")).toBeUndefined();
		let hasSurroundingRing = false;
		first.traverse((object) => {
			if (object instanceof THREE.Mesh && object.geometry instanceof THREE.RingGeometry) {
				hasSurroundingRing = true;
			}
		});
		expect(hasSurroundingRing).toBe(false);

		const secondMaterials: THREE.Material[] = [];
		secondCharacter.traverse((object) => {
			if (object instanceof THREE.Mesh) {
				if (Array.isArray(object.material)) secondMaterials.push(...object.material);
				else secondMaterials.push(object.material);
			}
		});
		expect(secondMaterials.length).toBeGreaterThan(5);
		expect(secondMaterials.every((material) => material.opacity === 0.35)).toBe(true);

		visuals.destroy();
	});

	it("keeps the existing map transform and carry anchor, and faces movement direction", () => {
		const layer = new THREE.Group();
		const visuals = createPlayerVisuals(layer);
		const player = playerAt(100, 200);
		const players = new Map([["player-1", player]]);

		visuals.update(players);
		const playerGroup = namedGroup(layer, "player-player-1");
		const character = namedGroup(playerGroup, "crew-character");
		const carryAnchor = visuals.getCarryAnchor("player-1");
		expect(playerGroup.position.x).toBe(100 - MAP_WIDTH / 2);
		expect(playerGroup.position.y).toBe(MAP_HEIGHT / 2 - 200);
		expect(carryAnchor?.parent).toBe(playerGroup);
		expect(carryAnchor?.position.x).toBe(PLAYER_RADIUS);

		visuals.update(players);
		expect(playerGroups(layer)).toHaveLength(1);
		player.x = 105;
		player.anim = "walk";
		visuals.update(players);
		expect(character.userData.facing).toBe("right");
		expect(character.rotation.x).toBe(0);
		expect(character.rotation.y).toBe(0);
		expect(character.rotation.z).toBe(0);

		visuals.destroy();
	});

	it.each([
		{ direction: "up", dx: 0, dy: -5 },
		{ direction: "down", dx: 0, dy: 5 },
		{ direction: "left", dx: -5, dy: 0 },
		{ direction: "right", dx: 5, dy: 0 },
	] as const)("faces $direction while keeping the character upright", ({ direction, dx, dy }) => {
		const layer = new THREE.Group();
		const visuals = createPlayerVisuals(layer);
		const player = playerAt(100, 100);
		const players = new Map([["player-1", player]]);
		visuals.update(players);

		const playerGroup = namedGroup(layer, "player-player-1");
		const character = namedGroup(playerGroup, "crew-character");
		player.x += dx;
		player.y += dy;
		visuals.update(players);

		expect(character.userData.facing).toBe(direction);
		expect(character.rotation.x).toBe(0);
		expect(character.rotation.y).toBe(0);
		expect(character.rotation.z).toBe(0);
		expect(playerGroup.rotation.z).toBe(0);
		expect(namedMesh(character, "crew-head").position.y)
			.toBeGreaterThan(namedMesh(character, "crew-torso").position.y);
		expect(namedGroup(character, "left-leg-pivot").position.y)
			.toBeLessThan(namedMesh(character, "crew-torso").position.y);

		const leftEye = namedMesh(character, "left-eye");
		const rightEye = namedMesh(character, "right-eye");
		const nose = namedMesh(character, "crew-nose");
		const hair = namedMesh(character, "back-hair");
		switch (direction) {
			case "up":
				expect(leftEye.visible).toBe(true);
				expect(rightEye.visible).toBe(true);
				expect(nose.visible).toBe(true);
				expect(hair.visible).toBe(false);
				break;
			case "down":
				expect(leftEye.visible).toBe(false);
				expect(rightEye.visible).toBe(false);
				expect(nose.visible).toBe(false);
				expect(hair.visible).toBe(true);
				break;
			case "left":
				expect(leftEye.visible).toBe(true);
				expect(rightEye.visible).toBe(false);
				expect(nose.position.x).toBeLessThan(0);
				break;
			case "right":
				expect(leftEye.visible).toBe(false);
				expect(rightEye.visible).toBe(true);
				expect(nose.position.x).toBeGreaterThan(0);
				break;
		}

		visuals.destroy();
	});

	it("animates idle, walking, and running poses without duplicate player objects", () => {
		const now = vi.spyOn(performance, "now").mockReturnValue(0);
		const layer = new THREE.Group();
		const visuals = createPlayerVisuals(layer);
		const player = playerAt(100, 200, "walk");
		const players = new Map([["player-1", player]]);

		visuals.update(players);
		const playerGroup = namedGroup(layer, "player-player-1");
		const character = namedGroup(playerGroup, "crew-character");
		const leftLeg = namedGroup(character, "left-leg-pivot");
		const leftArm = namedGroup(character, "left-arm-pivot");
		expect(leftLeg.rotation.z).toBeCloseTo(0);
		expect(leftArm.rotation.z).toBeCloseTo(-0.35);

		now.mockReturnValue(125);
		visuals.update(players);
		expect(leftLeg.rotation.z).not.toBeCloseTo(0);
		expect(leftArm.rotation.z).not.toBeCloseTo(-0.35);
		expect(playerGroups(layer)).toHaveLength(1);

		player.anim = "run";
		now.mockReturnValue(250);
		visuals.update(players);
		expect(leftLeg.rotation.z).not.toBeCloseTo(Math.sin(125 / 1000 * 8) * 0.38);
		player.anim = "idle";
		visuals.update(players);
		expect(leftLeg.rotation.z).toBeCloseTo(0);

		visuals.destroy();
	});

	it("removes visuals and carry anchors on cleanup", () => {
		const layer = new THREE.Group();
		const visuals = createPlayerVisuals(layer);
		const players = new Map([["player-1", playerAt(100, 200)]]);
		visuals.update(players);

		visuals.destroy();
		visuals.destroy();
		visuals.update(players);

		expect(layer.children).toHaveLength(0);
		expect(visuals.getCarryAnchor("player-1")).toBeUndefined();
	});
});
