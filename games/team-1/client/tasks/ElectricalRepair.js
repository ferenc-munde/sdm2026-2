
import * as THREE from "three";

export function createElectricalRepair(scene, container) {
  const station = new THREE.Group();
  station.position.set(5.0, 0, 0);

  // Electrical panel
  const panel = new THREE.Mesh(
    new THREE.BoxGeometry(0.9, 1.3, 0.2),
    new THREE.MeshStandardMaterial({
      color: 0x303943,
      metalness: 0.5,
      roughness: 0.5
    })
  );
  panel.position.y = 1.1;
  station.add(panel);

  // Status light
  const statusLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 16, 16),
    new THREE.MeshBasicMaterial({ color: 0xff3333 })
  );
  statusLight.position.set(0, 1.55, 0.12);
  station.add(statusLight);

  // Coloured wire indicators
  const colors = [0xff3333, 0x3399ff, 0xffcc33];

  colors.forEach((color, i) => {
    const wire = new THREE.Mesh(
      new THREE.BoxGeometry(0.14, 0.09, 0.04),
      new THREE.MeshBasicMaterial({ color })
    );
    wire.position.set(-0.22 + i * 0.22, 1.1, 0.13);
    station.add(wire);
  });

  scene.add(station);

  // Interaction prompt
  const prompt = document.createElement("div");
  prompt.textContent = "Press E to repair electrical panel";
  prompt.style.cssText = `
    position:absolute;
    bottom:30px;
    left:50%;
    transform:translateX(-50%);
    background:#17212b;
    color:white;
    padding:12px 20px;
    border-radius:8px;
    display:none;
    z-index:10;
    font:16px Arial;
  `;

  container.style.position = "relative";
  container.appendChild(prompt);

  // Puzzle interface
  const puzzle = document.createElement("div");
  puzzle.style.cssText = `
    position:absolute;
    inset:0;
    display:none;
    align-items:center;
    justify-content:center;
    background:rgba(0,0,0,0.8);
    z-index:20;
    color:white;
    font:18px Arial;
  `;

  puzzle.innerHTML = `
    <div style="background:#263746;padding:28px;border-radius:12px;text-align:center;max-width:340px;width:90%">
      <h2>Electrical Repair</h2>
      <p>Connect the wires in the correct order:</p>
      <p style="font-size:28px">🔴 🔵 🟡</p>
      <div style="display:flex;justify-content:center;gap:10px;margin:20px 0">
        <button data-wire="1">🔴</button>
        <button data-wire="2">🔵</button>
        <button data-wire="3">🟡</button>
      </div>
      <p id="repair-status">Select the wires in order.</p>
      <button id="repair-close">Close</button>
    </div>
  `;

  container.appendChild(puzzle);

  let completed = false;
  let active = false;
  let nearby = false;
  let sequence = [];

  const status = puzzle.querySelector("#repair-status");
  const buttons = puzzle.querySelectorAll("[data-wire]");

  buttons.forEach(button => {
    button.style.cssText = "font-size:28px;padding:12px;cursor:pointer";

    button.addEventListener("click", () => {
      if (!active || completed) return;

      sequence.push(Number(button.dataset.wire));

      if (sequence.length === 3) {
        if (sequence.join(",") === "1,2,3") {
          completed = true;
          status.textContent = "Electrical system restored!";
          status.style.color = "#55ff88";
          statusLight.material.color.set(0x33ff66);
          prompt.textContent = "Electrical system repaired!";
          prompt.style.display = "block";
        } else {
          sequence = [];
          status.textContent = "Incorrect! Try again.";
        }
      } else {
        status.textContent = `Connected ${sequence.length}/3 wires`;
      }
    });
  });

  function closePuzzle() {
    active = false;
    puzzle.style.display = "none";
  }

  puzzle.querySelector("#repair-close").addEventListener("click", closePuzzle);

  function handleKey(event) {
    if (event.code !== "KeyE" || event.repeat) return;

    if (!active && nearby && !completed) {
      active = true;
      sequence = [];
      status.textContent = "Select the wires in order.";
      puzzle.style.display = "flex";
    }
  }

  window.addEventListener("keydown", handleKey);

  return {
    update(players) {
      nearby = !completed && players.some(player =>
        player.position.distanceTo(station.position) < 2.5
      );

      if (!active && !completed) {
        prompt.style.display = nearby ? "block" : "none";
      }
    },

    dispose() {
      window.removeEventListener("keydown", handleKey);
      prompt.remove();
      puzzle.remove();
    }
  };
}
