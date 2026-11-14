import * as THREE from "three";
import type { Item } from "../shared/state.ts";

const MAP_WIDTH = 1600;
const MAP_HEIGHT = 1000;
const GROUND_Z = 0.12;
const HELD_OFFSET_X = 4;
const HELD_OFFSET_Z = 0.04;
const FUEL_CAPACITY = 100;

const appearances = {
	wrench: { color: "#c7cbd0", sides: 6 },
	extinguisher: { color: "#df5148", sides: 8 },
	battery: { color: "#e0bc4e", sides: 4 },
	coal: { color: "#454a48", sides: 7 },
	parts: { color: "#83a891", sides: 5 },
	flashlight: { color: "#e6d98b", sides: 3 },
	unknown: { color: "#a6a6a6", sides: 8 },
} as const;

type Appearance = keyof typeof appearances;

interface ItemVisual {
	group: THREE.Group;
	token: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
	fuelIndicator: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

function appearanceFor(itemType: string): Appearance {
	switch (itemType) {
		case "wrench":
		case "extinguisher":
		case "battery":
		case "coal":
		case "parts":
		case "flashlight":
			return itemType;
		default:
			return "unknown";
	}
}

export function createItemVisuals(
	group: THREE.Group,
	getCarryAnchor: (playerId: string) => THREE.Object3D | undefined,
) {
	const geometries: Record<Appearance, THREE.CircleGeometry> = {
		wrench: new THREE.CircleGeometry(5, appearances.wrench.sides),
		extinguisher: new THREE.CircleGeometry(5, appearances.extinguisher.sides),
		battery: new THREE.CircleGeometry(5, appearances.battery.sides),
		coal: new THREE.CircleGeometry(5, appearances.coal.sides),
		parts: new THREE.CircleGeometry(5, appearances.parts.sides),
		flashlight: new THREE.CircleGeometry(5, appearances.flashlight.sides),
		unknown: new THREE.CircleGeometry(5, appearances.unknown.sides),
	};
	const materials: Record<Appearance, THREE.MeshBasicMaterial> = {
		wrench: new THREE.MeshBasicMaterial({ color: appearances.wrench.color }),
		extinguisher: new THREE.MeshBasicMaterial({ color: appearances.extinguisher.color }),
		battery: new THREE.MeshBasicMaterial({ color: appearances.battery.color }),
		coal: new THREE.MeshBasicMaterial({ color: appearances.coal.color }),
		parts: new THREE.MeshBasicMaterial({ color: appearances.parts.color }),
		flashlight: new THREE.MeshBasicMaterial({ color: appearances.flashlight.color }),
		unknown: new THREE.MeshBasicMaterial({ color: appearances.unknown.color }),
	};
	const fuelGeometry = new THREE.BoxGeometry(5, 1, 0.1);
	const fuelMaterial = new THREE.MeshBasicMaterial({ color: "#fff1a8" });
	const visuals = new Map<string, ItemVisual>();
	let destroyed = false;

	function createVisual(itemId: string): ItemVisual {
		const itemGroup = new THREE.Group();
		const token = new THREE.Mesh(geometries.unknown, materials.unknown);
		token.position.z = 0.01;
		const fuelIndicator = new THREE.Mesh(fuelGeometry, fuelMaterial);
		fuelIndicator.position.set(0, 0, 0.02);
		fuelIndicator.visible = false;
		itemGroup.add(token, fuelIndicator);
		group.add(itemGroup);
		const visual = { group: itemGroup, token, fuelIndicator };
		visuals.set(itemId, visual);
		return visual;
	}

	function setParent(itemGroup: THREE.Group, parent: THREE.Object3D): void {
		if (itemGroup.parent === parent) return;
		itemGroup.removeFromParent();
		parent.add(itemGroup);
	}

	function removeVisual(itemId: string): void {
		const visual = visuals.get(itemId);
		if (!visual) return;
		visual.group.removeFromParent();
		visuals.delete(itemId);
	}

	return {
		update(items: Iterable<[string, Item]>): void {
			if (destroyed) return;
			const seen = new Set<string>();

			for (const [itemId, item] of items) {
				seen.add(itemId);
				const visual = visuals.get(itemId) ?? createVisual(itemId);
				const appearance = appearanceFor(item.type);
				visual.token.geometry = geometries[appearance];
				visual.token.material = materials[appearance];
				visual.fuelIndicator.visible = item.type === "extinguisher";

				if (item.type === "extinguisher") {
					const fuel = Number.isFinite(item.fuel)
						? Math.min(FUEL_CAPACITY, Math.max(0, item.fuel))
						: 0;
					const remaining = fuel / FUEL_CAPACITY;
					visual.fuelIndicator.scale.x = remaining;
					visual.fuelIndicator.position.x = -2.5 * (1 - remaining);
				}

				if (!item.holderId) {
					setParent(visual.group, group);
					visual.group.visible = true;
					visual.group.position.set(
						item.x - MAP_WIDTH / 2,
						MAP_HEIGHT / 2 - item.y,
						GROUND_Z,
					);
					continue;
				}

				const anchor = getCarryAnchor(item.holderId);
				if (!anchor) {
					setParent(visual.group, group);
					visual.group.visible = false;
					continue;
				}
				setParent(visual.group, anchor);
				visual.group.visible = true;
				visual.group.position.set(HELD_OFFSET_X, 0, HELD_OFFSET_Z);
			}

			for (const itemId of [...visuals.keys()]) {
				if (!seen.has(itemId)) removeVisual(itemId);
			}
		},

		destroy(): void {
			if (destroyed) return;
			destroyed = true;
			for (const itemId of [...visuals.keys()]) removeVisual(itemId);
			for (const geometry of Object.values(geometries)) geometry.dispose();
			for (const material of Object.values(materials)) material.dispose();
			fuelGeometry.dispose();
			fuelMaterial.dispose();
		},
	};
}
