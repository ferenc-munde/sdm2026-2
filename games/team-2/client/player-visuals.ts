import * as THREE from "three";
import { MAP_HEIGHT, MAP_WIDTH, PLAYER_RADIUS } from "../shared/map.ts";
import type { Player } from "../shared/state.ts";

const PLAYER_COLORS = ["#62cdd3", "#e46c63", "#e0bc4e", "#6f9bea"] as const;
const SKIN_COLORS = ["#d8a178", "#c98c5b", "#e2b78f", "#a66c4e"] as const;
const LOCAL_SHIRT_TINT = new THREE.Color("#ffffff");

type AnimationState = "idle" | "walk" | "run";
type FacingDirection = "up" | "down" | "left" | "right";

interface PlayerVisual {
	group: THREE.Group;
	character: THREE.Group;
	torso: THREE.Mesh;
	eyes: [THREE.Mesh, THREE.Mesh];
	nose: THREE.Mesh;
	hair: THREE.Mesh;
	leftArm: THREE.Group;
	rightArm: THREE.Group;
	leftLeg: THREE.Group;
	rightLeg: THREE.Group;
	materials: THREE.Material[];
	shirtMaterial: THREE.MeshLambertMaterial;
	shirtColor: THREE.Color;
	carryAnchor: THREE.Group;
	anim: AnimationState;
	facing: FacingDirection;
	lastX: number;
	lastY: number;
}

function animationState(anim: string): AnimationState {
	switch (anim) {
		case "walk":
		case "run":
			return anim;
		default:
			return "idle";
	}
}

function facingFromDelta(dx: number, dy: number): FacingDirection | undefined {
	if (Math.hypot(dx, dy) <= 0.01) return undefined;
	if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? "left" : "right";
	return dy < 0 ? "up" : "down";
}

function applyFacing(visual: PlayerVisual, facing: FacingDirection): void {
	visual.facing = facing;
	visual.character.userData.facing = facing;
	visual.hair.visible = facing === "down";
	visual.eyes[0].visible = facing === "up" || facing === "left";
	visual.eyes[1].visible = facing === "up" || facing === "right";
	visual.nose.visible = facing !== "down";

	switch (facing) {
		case "up":
		visual.eyes[0].position.set(-0.75, 6, 0.35);
		visual.eyes[1].position.set(0.75, 6, 0.35);
		visual.nose.position.set(0, 6.85, 0.2);
			break;
		case "down":
			break;
		case "left":
			visual.eyes[0].position.set(-1.2, 5.65, 0.35);
			visual.nose.position.set(-2.05, 5.5, 0.2);
			break;
		case "right":
			visual.eyes[1].position.set(1.2, 5.65, 0.35);
			visual.nose.position.set(2.05, 5.5, 0.2);
			break;
	}
}

function applyAnimationPose(visual: PlayerVisual, time: number): void {
	const moving = visual.anim !== "idle";
	const running = visual.anim === "run";
	const speed = running ? 13 : 8;
	const swing = moving ? Math.sin(time * speed) * (running ? 0.62 : 0.38) : 0;

	visual.leftArm.rotation.z = -0.35 + swing;
	visual.rightArm.rotation.z = 0.35 - swing;
	visual.leftLeg.rotation.z = -swing;
	visual.rightLeg.rotation.z = swing;
}

export function createPlayerVisuals(group: THREE.Group) {
	const torsoGeometry = new THREE.CylinderGeometry(1, 1.15, 5, 8);
	const armGeometry = new THREE.CylinderGeometry(0.52, 0.62, 4.3, 6);
	const legGeometry = new THREE.CylinderGeometry(0.68, 0.78, 4.3, 6);
	const headGeometry = new THREE.SphereGeometry(2.35, 12, 8);
	const handGeometry = new THREE.SphereGeometry(0.72, 8, 6);
	const footGeometry = new THREE.BoxGeometry(1.55, 1.8, 0.75);
	const eyeGeometry = new THREE.SphereGeometry(0.24, 8, 6);
	const noseGeometry = new THREE.SphereGeometry(0.38, 8, 6);
	const hairGeometry = new THREE.SphereGeometry(1.25, 8, 6);
	const lighting = new THREE.Group();
	lighting.name = "crew-lighting";
	const ambientLight = new THREE.AmbientLight("#ffffff", 0.9);
	const keyLight = new THREE.DirectionalLight("#ffffff", 1.5);
	keyLight.position.set(-4, 6, 12);
	lighting.add(ambientLight, keyLight);
	group.add(lighting);

	const visuals = new Map<string, PlayerVisual>();
	let destroyed = false;

	function removePlayer(playerId: string): void {
		const visual = visuals.get(playerId);
		if (!visual) return;
		visual.group.removeFromParent();
		for (const material of visual.materials) material.dispose();
		visuals.delete(playerId);
	}

	function createVisual(playerId: string, seat: number): PlayerVisual {
		const playerGroup = new THREE.Group();
		playerGroup.name = `player-${playerId}`;
		playerGroup.userData.playerId = playerId;

		const shirtColor = new THREE.Color(PLAYER_COLORS[seat % PLAYER_COLORS.length]);
		const shirtMaterial = new THREE.MeshLambertMaterial({
			color: shirtColor,
			transparent: true,
		});
		const pantsMaterial = new THREE.MeshLambertMaterial({ color: "#28373b", transparent: true });
		const skinMaterial = new THREE.MeshLambertMaterial({
			color: SKIN_COLORS[seat % SKIN_COLORS.length],
			transparent: true,
		});
		const hairMaterial = new THREE.MeshLambertMaterial({ color: "#47312d", transparent: true });
		const shoeMaterial = new THREE.MeshLambertMaterial({ color: "#172321", transparent: true });
		const eyeMaterial = new THREE.MeshBasicMaterial({ color: "#172d31", transparent: true });
		const materials: THREE.Material[] = [
			shirtMaterial,
			pantsMaterial,
			skinMaterial,
			hairMaterial,
			shoeMaterial,
			eyeMaterial,
		];

		const character = new THREE.Group();
		character.name = "crew-character";
		character.position.z = 0.65;
		character.scale.setScalar(1.68);
		character.userData.facing = "up";
		playerGroup.add(character);

		const torso = new THREE.Mesh(torsoGeometry, shirtMaterial);
		torso.name = "crew-torso";
		torso.position.set(0, 0.8, 0.05);
		torso.scale.z = 0.35;
		character.add(torso);

		const head = new THREE.Mesh(headGeometry, skinMaterial);
		head.name = "crew-head";
		head.position.set(0, 5.5, 0.05);
		head.scale.z = 0.19;
		character.add(head);

		const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
		leftEye.name = "left-eye";
		leftEye.position.set(-0.75, 6, 0.35);
		const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
		rightEye.name = "right-eye";
		rightEye.position.set(0.75, 6, 0.35);
		const eyes: [THREE.Mesh, THREE.Mesh] = [leftEye, rightEye];
		character.add(leftEye, rightEye);

		const nose = new THREE.Mesh(noseGeometry, skinMaterial);
		nose.name = "crew-nose";
		nose.position.set(0, 6.85, 0.2);
		character.add(nose);

		const hair = new THREE.Mesh(hairGeometry, hairMaterial);
		hair.name = "back-hair";
		hair.position.set(0, 4.2, 0.35);
		hair.scale.z = 0.19;
		hair.visible = false;
		character.add(hair);

		const leftArm = new THREE.Group();
		leftArm.name = "left-arm-pivot";
		leftArm.position.set(-1.05, 3, 0.08);
		const rightArm = new THREE.Group();
		rightArm.name = "right-arm-pivot";
		rightArm.position.set(1.05, 3, 0.08);
		for (const [arm, side] of [[leftArm, -1], [rightArm, 1]] as const) {
			const limb = new THREE.Mesh(armGeometry, shirtMaterial);
			limb.name = side < 0 ? "left-arm" : "right-arm";
			limb.position.y = -2;
			limb.scale.z = 0.33;
			const hand = new THREE.Mesh(handGeometry, skinMaterial);
			hand.name = side < 0 ? "left-hand" : "right-hand";
			hand.position.set(0, -4.25, 0);
			hand.scale.z = 0.24;
			arm.add(limb, hand);
			character.add(arm);
		}

		const leftLeg = new THREE.Group();
		leftLeg.name = "left-leg-pivot";
		leftLeg.position.set(-0.65, -1.5, 0.07);
		const rightLeg = new THREE.Group();
		rightLeg.name = "right-leg-pivot";
		rightLeg.position.set(0.65, -1.5, 0.07);
		for (const [leg, side] of [[leftLeg, -1], [rightLeg, 1]] as const) {
			const limb = new THREE.Mesh(legGeometry, pantsMaterial);
			limb.name = side < 0 ? "left-leg" : "right-leg";
			limb.position.y = -2;
			limb.scale.z = 0.24;
			const foot = new THREE.Mesh(footGeometry, shoeMaterial);
			foot.name = side < 0 ? "left-foot" : "right-foot";
			foot.position.set(0, -4, 0.02);
			leg.add(limb, foot);
			character.add(leg);
		}

		const carryAnchor = new THREE.Group();
		carryAnchor.name = "carry-anchor";
		carryAnchor.position.set(PLAYER_RADIUS, 0, 0.05);
		playerGroup.add(carryAnchor);
		group.add(playerGroup);

		const visual: PlayerVisual = {
			group: playerGroup,
			character,
			torso,
			eyes,
			nose,
			hair,
			leftArm,
			rightArm,
			leftLeg,
			rightLeg,
			materials,
			shirtMaterial,
			shirtColor,
			carryAnchor,
			anim: "idle",
			facing: "up",
			lastX: 0,
			lastY: 0,
		};
		applyFacing(visual, "up");
		torso.onBeforeRender = () => applyAnimationPose(visual, performance.now() / 1000);
		return visual;
	}

	return {
		update(players: Iterable<[string, Player]>, localPlayerId?: string): void {
			if (destroyed) return;
			const seen = new Set<string>();
			let seat = 0;

			for (const [playerId, player] of players) {
				seen.add(playerId);
				let visual = visuals.get(playerId);
				if (!visual) {
					visual = createVisual(playerId, seat);
					visual.lastX = player.x;
					visual.lastY = player.y;
					visuals.set(playerId, visual);
				}

				const dx = player.x - visual.lastX;
				const dy = player.y - visual.lastY;
				const facing = facingFromDelta(dx, dy);
				if (facing) applyFacing(visual, facing);
				visual.lastX = player.x;
				visual.lastY = player.y;
				visual.group.position.set(
					player.x - MAP_WIDTH / 2,
					MAP_HEIGHT / 2 - player.y,
					0.2,
				);
				visual.shirtMaterial.color.copy(visual.shirtColor);
				if (playerId === localPlayerId) {
					visual.shirtMaterial.color.lerp(LOCAL_SHIRT_TINT, 0.35);
				}
				const opacity = player.eliminated ? 0.35 : 1;
				for (const material of visual.materials) material.opacity = opacity;

				visual.anim = animationState(player.anim);
				applyAnimationPose(visual, performance.now() / 1000);

				seat += 1;
			}

			for (const playerId of [...visuals.keys()]) {
				if (!seen.has(playerId)) removePlayer(playerId);
			}
		},

		getCarryAnchor(playerId: string): THREE.Object3D | undefined {
			return destroyed ? undefined : visuals.get(playerId)?.carryAnchor;
		},

		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			for (const playerId of [...visuals.keys()]) removePlayer(playerId);
			lighting.removeFromParent();
			torsoGeometry.dispose();
			armGeometry.dispose();
			legGeometry.dispose();
			headGeometry.dispose();
			handGeometry.dispose();
			footGeometry.dispose();
			eyeGeometry.dispose();
			noseGeometry.dispose();
			hairGeometry.dispose();
		},
	};
}
