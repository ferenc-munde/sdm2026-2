import * as THREE from "three";
import type { Player } from "../shared/state.ts";

const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1000;
const PLAYER_RADIUS = 8;
const PLAYER_COLORS = ["#62cdd3", "#e46c63", "#e0bc4e", "#6f9bea"] as const;

interface PlayerVisual {
	group: THREE.Group;
	bodyMaterial: THREE.MeshBasicMaterial;
	outlineMaterial: THREE.MeshBasicMaterial;
	activityMaterial: THREE.MeshBasicMaterial;
	activity: THREE.Mesh;
	carryAnchor: THREE.Group;
}

export function createPlayerVisuals(group: THREE.Group) {
	const bodyGeometry = new THREE.CircleGeometry(PLAYER_RADIUS, 20);
	const outlineGeometry = new THREE.RingGeometry(PLAYER_RADIUS + 0.5, PLAYER_RADIUS + 2.5, 24);
	const activityGeometry = new THREE.RingGeometry(PLAYER_RADIUS + 4, PLAYER_RADIUS + 5.5, 24);
	const visuals = new Map<string, PlayerVisual>();
	let destroyed = false;

	function removePlayer(playerId: string): void {
		const visual = visuals.get(playerId);
		if (!visual) return;
		visual.group.removeFromParent();
		visual.bodyMaterial.dispose();
		visual.outlineMaterial.dispose();
		visual.activityMaterial.dispose();
		visuals.delete(playerId);
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
					const playerGroup = new THREE.Group();
					const bodyMaterial = new THREE.MeshBasicMaterial({
						color: PLAYER_COLORS[seat % PLAYER_COLORS.length],
						transparent: true,
					});
					const outlineMaterial = new THREE.MeshBasicMaterial({
						color: "#10161a",
						transparent: true,
					});
					const activityMaterial = new THREE.MeshBasicMaterial({
						color: "#cce8e7",
						transparent: true,
					});
					const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
					outline.position.z = 0.01;
					const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
					body.position.z = 0.02;
					const activity = new THREE.Mesh(activityGeometry, activityMaterial);
					activity.position.z = 0.03;
					activity.visible = false;
					const carryAnchor = new THREE.Group();
					carryAnchor.position.set(PLAYER_RADIUS, 0, 0.05);
					playerGroup.add(outline, body, activity, carryAnchor);
					group.add(playerGroup);

					visual = {
						group: playerGroup,
						bodyMaterial,
						outlineMaterial,
						activityMaterial,
						activity,
						carryAnchor,
					};
					visuals.set(playerId, visual);
				}

				visual.group.position.set(
					player.x - MAP_WIDTH / 2,
					MAP_HEIGHT / 2 - player.y,
					0.2,
				);
				visual.outlineMaterial.color.set(playerId === localPlayerId ? "#ffffff" : "#10161a");
				const opacity = player.eliminated ? 0.35 : 1;
				visual.bodyMaterial.opacity = opacity;
				visual.outlineMaterial.opacity = opacity;

				if (player.anim === "walk" || player.anim === "run") {
					visual.activity.visible = true;
					visual.activity.scale.setScalar(player.anim === "run" ? 1.2 : 1);
					visual.activityMaterial.color.set(player.anim === "run" ? "#ffd56a" : "#cce8e7");
					visual.activityMaterial.opacity = opacity * (player.anim === "run" ? 0.95 : 0.7);
				} else {
					visual.activity.visible = false;
				}

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
			bodyGeometry.dispose();
			outlineGeometry.dispose();
			activityGeometry.dispose();
		},
	};
}
