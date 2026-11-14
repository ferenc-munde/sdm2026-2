// A bot crewmate for testing alone (#27): `node bot.mjs`.
// It creates a room on the local server and prints the code. When a human joins, it sets the
// crew size to 2 and departs, then stands still so the human can play the real game.
// After a win or loss it waits 5 seconds and presses "play again".
import { Client } from "@colyseus/sdk";

const SERVER = process.env.SERVER ?? "ws://localhost:2567";
const room = await new Client(SERVER).create("game");
let seq = 0;
const send = (input) => room.send("input", { seq: ++seq, input });
send({ type: "createRoom", name: "Bot" });

let departed = false;
let replayTimer = null;
let lastPhase = "";
room.onStateChange((state) => {
  if (!state.view) return;
  const view = JSON.parse(state.view);
  if (view.phase !== lastPhase) {
    lastPhase = view.phase;
    console.log(`phase: ${view.phase}`);
  }
  const people = Object.values(view.players).filter((p) => p.connected);
  if (view.phase === "lobby" && people.length >= 2 && !departed) {
    departed = true;
    console.log(`crew: ${people.map((p) => p.name).join(", ")}; departing`);
    send({ type: "configureRoom", crewSize: people.length });
    send({ type: "startGame" });
  }
  if (view.phase === "playing") departed = false;
  if ((view.phase === "won" || view.phase === "lost") && !replayTimer) {
    replayTimer = setTimeout(() => {
      replayTimer = null;
      send({ type: "playAgain" });
    }, 5000);
  }
});

const waitForCode = () => new Promise((resolve) => {
  const check = () => (room.state?.code ? resolve(room.state.code) : setTimeout(check, 50));
  check();
});
console.log(`ROOM CODE: ${await waitForCode()}`);
console.log("Join it at http://localhost:5173 with that code. Press Ctrl+C to stop the bot.");
