
const KEY_MAP = [
  { up: "w", down: "s", left: "a", right: "d" },
  { up: "arrowup", down: "arrowdown", left: "arrowleft", right: "arrowright" },
  { up: "i", down: "k", left: "j", right: "l" },
  { up: "t", down: "g", left: "f", right: "h" }
];

const SPEED = 5;
const LIMIT_X = 5.1;
const LIMIT_Z = 10.3;
const PLAYER_RADIUS = 0.38;

const SEAT_Z = [-7, -2.5, 2.5, 7];

function hitsSeat(x, z) {
  for (const side of [-1, 1]) {
    for (const seatZ of SEAT_Z) {
      const seatX = side * 3.75;

      if (
        Math.abs(x - seatX) < 1.15 + PLAYER_RADIUS &&
        Math.abs(z - seatZ) < 1.25 + PLAYER_RADIUS
      ) {
        return true;
      }
    }
  }
  return false;
}

export function createPlayerControls(players) {
  const keys = new Set();

  function onKeyDown(event) {
    const key = event.key.toLowerCase();

    if (KEY_MAP.some(map =>
      Object.values(map).includes(key)
    )) {
      event.preventDefault();
      keys.add(key);
    }
  }

  function onKeyUp(event) {
    keys.delete(event.key.toLowerCase());
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  function update(delta) {
    players.forEach((player, index) => {
      const controls = KEY_MAP[index];
      if (!controls) return;

      let dx = 0;
      let dz = 0;

      if (keys.has(controls.left)) dx -= 1;
      if (keys.has(controls.right)) dx += 1;
      if (keys.has(controls.up)) dz -= 1;
      if (keys.has(controls.down)) dz += 1;

      if (dx === 0 && dz === 0) return;

      const length = Math.hypot(dx, dz);
      dx = (dx / length) * SPEED * delta;
      dz = (dz / length) * SPEED * delta;

      const nextX = THREE_CLAMP(player.position.x + dx, -LIMIT_X, LIMIT_X);
      const nextZ = THREE_CLAMP(player.position.z + dz, -LIMIT_Z, LIMIT_Z);

      // Check each axis separately so players can slide along obstacles.
      if (!hitsSeat(nextX, player.position.z)) {
        player.position.x = nextX;
      }

      if (!hitsSeat(player.position.x, nextZ)) {
        player.position.z = nextZ;
      }
    });
  }

  function dispose() {
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("keyup", onKeyUp);
  }

  return { update, dispose };
}

function THREE_CLAMP(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
