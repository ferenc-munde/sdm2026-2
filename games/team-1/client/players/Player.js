
import * as THREE from "three";

const PLAYER_COLORS = [
  0x3498db, // Blue
  0xe74c3c, // Red
  0x2ecc71, // Green
  0xf1c40f  // Yellow
];

export function createPlayer(id, x, z) {
  const player = new THREE.Group();
  player.name = `Player${id}`;

  const color = PLAYER_COLORS[id - 1];

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.65, 0.8, 0.8),
    new THREE.MeshStandardMaterial({ color, roughness: 0.8 })
  );
  body.position.y = 0.65;
  body.castShadow = true;
  player.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 12, 10),
    new THREE.MeshStandardMaterial({ color: 0xf0c7a5 })
  );
  head.position.set(0, 1.2, -0.05);
  head.castShadow = true;
  player.add(head);

  // Small colored marker above the character
  const marker = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.08, 0.22),
    new THREE.MeshBasicMaterial({ color })
  );
  marker.position.y = 1.65;
  player.add(marker);

  player.position.set(x, 0, z);
  player.userData.playerId = id;

  return player;
}
