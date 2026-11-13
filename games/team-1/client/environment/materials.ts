import * as THREE from "three";

export const trainMaterials = {
  floors: {
    engine: new THREE.MeshStandardMaterial({
      color: "#36434a",
      roughness: 0.92,
    }),
    electrical: new THREE.MeshStandardMaterial({
      color: "#334e52",
      roughness: 0.88,
    }),
    control: new THREE.MeshStandardMaterial({
      color: "#3d5260",
      roughness: 0.86,
    }),
    passenger: new THREE.MeshStandardMaterial({
      color: "#655546",
      roughness: 0.94,
    }),
    rear: new THREE.MeshStandardMaterial({
      color: "#50464b",
      roughness: 0.9,
    }),
  },
  wall: new THREE.MeshStandardMaterial({
    color: "#89949a",
    roughness: 0.76,
    metalness: 0.22,
  }),
  wallTrim: new THREE.MeshStandardMaterial({
    color: "#d0a45f",
    roughness: 0.58,
    metalness: 0.38,
  }),
  metal: new THREE.MeshStandardMaterial({
    color: "#9ba9ad",
    roughness: 0.48,
    metalness: 0.62,
  }),
  darkMetal: new THREE.MeshStandardMaterial({
    color: "#303a40",
    roughness: 0.7,
    metalness: 0.55,
  }),
  engine: new THREE.MeshStandardMaterial({
    color: "#b7683d",
    roughness: 0.62,
    metalness: 0.35,
  }),
  electrical: new THREE.MeshStandardMaterial({
    color: "#527a78",
    roughness: 0.7,
    metalness: 0.28,
  }),
  control: new THREE.MeshStandardMaterial({
    color: "#c28b45",
    roughness: 0.55,
    metalness: 0.3,
  }),
  seat: new THREE.MeshStandardMaterial({
    color: "#8f493b",
    roughness: 0.88,
  }),
  seatBase: new THREE.MeshStandardMaterial({
    color: "#42484a",
    roughness: 0.6,
    metalness: 0.45,
  }),
  brake: new THREE.MeshStandardMaterial({
    color: "#9d7046",
    roughness: 0.62,
    metalness: 0.42,
  }),
  floorMarking: new THREE.MeshStandardMaterial({
    color: "#d5b66e",
    roughness: 0.82,
    metalness: 0.1,
  }),
} as const;