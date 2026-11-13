import { MockSessionAdapter, SessionError, type LobbyPlayer, type SessionAdapter, type SessionEvent } from "./session-adapter.mjs";
import { createPreviewSnapshot, MockGameStateAdapter } from "./game-state-adapter.mjs";
import { mountGameplayView, type PreviewAction } from "./gameplay-view";
import { PlayerPreviewController } from "./player-preview-controller";

function getAppRoot(): HTMLDivElement {
  const root = document.querySelector<HTMLDivElement>("#app");
  if (!root) throw new Error("Lobby root element #app was not found.");
  return root;
}

const app = getAppRoot();

const adapter: SessionAdapter = new MockSessionAdapter();
let crew: LobbyPlayer[] = [];
let ownId = "";
let roomCode = "";
let pending = false;

app.innerHTML = `
  <header class="topbar">
    <a class="wordmark" href="#" aria-label="The Last Train home"><span class="wordmark-mark">LT</span><span>THE LAST TRAIN</span></a>
    <span class="chapter"><span class="live-dot"></span> DEPARTURE BOARD <span class="chapter-line"></span> 01 / 04</span>
  </header>
  <section class="hero" aria-labelledby="page-title">
    <div class="eyebrow"><span class="eyebrow-rule"></span> A JOURNEY FOR FOUR <span class="eyebrow-rule"></span></div>
    <h1 id="page-title">All aboard<span class="title-period">.</span></h1>
    <p class="hero-copy">Find your crew. The last train leaves at midnight.</p>
  </section>
  <section class="preview-note" role="note">
    <span class="preview-icon" aria-hidden="true">⌁</span>
    <span><strong>LOCAL PREVIEW</strong><span>This lobby is running without a game server. Rooms and players exist only in this browser session.</span></span>
    <span class="preview-pill">MOCK</span>
  </section>
  <section class="lobby-grid" aria-label="Create or join a crew">
    <article class="panel create-panel">
      <div class="panel-index">01 <span> / HOST</span></div>
      <h2>Start a new crew</h2>
      <p class="panel-copy">Bring your friends aboard. You’ll get a code to share.</p>
      <label class="field-label" for="host-name">YOUR NAME</label>
      <input id="host-name" class="text-input" maxlength="18" autocomplete="nickname" placeholder="e.g. Night Engineer" />
      <button id="create-session" class="button button-primary" type="button"><span>Create a session</span><span aria-hidden="true">↗</span></button>
    </article>
    <div class="divider" aria-hidden="true"><span>OR</span></div>
    <article class="panel join-panel">
      <div class="panel-index">02 <span> / JOIN</span></div>
      <h2>Join your crew</h2>
      <p class="panel-copy">Already have a ticket? Enter the four-character code.</p>
      <label class="field-label" for="join-name">YOUR NAME</label>
      <input id="join-name" class="text-input" maxlength="18" autocomplete="nickname" placeholder="e.g. Night Engineer" />
      <label class="field-label code-label" for="room-code">CREW CODE</label>
      <input id="room-code" class="text-input code-input" maxlength="4" autocomplete="off" placeholder="— — — —" aria-describedby="code-help" />
      <span id="code-help" class="visually-hidden">Enter the four-character crew code from your host.</span>
      <span class="field-hint">Local preview room: <strong>DEMO</strong></span>
      <button id="join-session" class="button button-secondary" type="button"><span>Join session</span><span aria-hidden="true">→</span></button>
    </article>
  </section>
  <p id="feedback" class="feedback" role="status" aria-live="polite"></p>
  <section id="crew-room" class="crew-room" aria-labelledby="crew-title" hidden>
    <div class="room-heading"><div><div class="panel-index">YOUR DEPARTURE</div><h2 id="crew-title">Crew is gathering</h2></div><button id="leave-session" class="leave-button" type="button">Leave crew <span aria-hidden="true">×</span></button></div>
    <div class="room-meta"><span class="status-chip"><span class="live-dot"></span><span id="connection-label">CONNECTED</span></span><span class="room-code-label">CREW CODE <strong id="active-code"></strong></span><span class="room-capacity" id="room-capacity"></span></div>
    <ul id="player-list" class="player-list" aria-label="Connected crew members"></ul>
    <p class="room-footnote"><span class="live-dot"></span> Waiting for the crew to assemble</p>
    <button id="board-train" class="button button-primary board-button" type="button"><span>Board the train</span><span aria-hidden="true">↗</span></button>
  </section>
  <section id="game-screen" class="game-screen" aria-label="Train journey" hidden></section>
  <footer class="footer"><span>NO. 001 — THE NIGHT LINE</span><span>DESTINATION UNKNOWN</span></footer>
`;

const feedback = app.querySelector<HTMLElement>("#feedback")!;
const room = app.querySelector<HTMLElement>("#crew-room")!;
const playerList = app.querySelector<HTMLUListElement>("#player-list")!;
const createButton = app.querySelector<HTMLButtonElement>("#create-session")!;
const joinButton = app.querySelector<HTMLButtonElement>("#join-session")!;
const gameScreen = app.querySelector<HTMLElement>("#game-screen")!;
let gameplayAdapter: MockGameStateAdapter | undefined;
let disposeGameplay: (() => void) | undefined;
let playerPreview: PlayerPreviewController | undefined;
let playerPreviewFrame = 0;

createButton.addEventListener("click", () => void connect("create"));
joinButton.addEventListener("click", () => void connect("join"));
app.querySelector<HTMLButtonElement>("#leave-session")!.addEventListener("click", () => void disconnect());
app.querySelector<HTMLButtonElement>("#board-train")!.addEventListener("click", startGameplayPreview);
app.querySelector<HTMLInputElement>("#room-code")!.addEventListener("input", (event) => {
  const input = event.currentTarget as HTMLInputElement;
  input.value = input.value.replace(/[^a-z0-9]/gi, "").toUpperCase();
});

const unsubscribe = adapter.subscribe((event) => handleSessionEvent(event));
window.addEventListener("pagehide", () => {
  unsubscribe();
  cancelAnimationFrame(playerPreviewFrame);
  playerPreview?.dispose();
  disposeGameplay?.();
  void adapter.leaveSession();
}, { once: true });

async function connect(mode: "create" | "join"): Promise<void> {
  if (pending) return;
  pending = true;
  setPending(true);
  showFeedback("Checking your ticket…", "neutral");
  try {
    const nameInput = app.querySelector<HTMLInputElement>(mode === "create" ? "#host-name" : "#join-name")!;
    const name = nameInput.value.trim();
    const session = mode === "create"
      ? await adapter.createSession(name)
      : await adapter.joinSession(app.querySelector<HTMLInputElement>("#room-code")!.value, name);
    roomCode = session.code;
    crew = session.players;
    ownId = session.playerId;
    renderRoom();
    showFeedback(mode === "create" ? "Your crew is ready. Share the code to invite your friends." : "You’re aboard. Your crew can see you.", "success");
  } catch (error) {
    const message = error instanceof SessionError ? error.message : "We couldn’t connect just now. Please try again.";
    showFeedback(message, "error");
  } finally {
    pending = false;
    setPending(false);
  }
}

async function disconnect(): Promise<void> {
  await adapter.leaveSession();
  crew = [];
  roomCode = "";
  ownId = "";
  room.hidden = true;
  showFeedback("You left the crew.", "neutral");
  app.querySelector<HTMLInputElement>("#host-name")!.focus();
}

function handleSessionEvent(event: SessionEvent): void {
  if (event.type === "player-joined") {
    crew.push(event.player);
    showFeedback(`${event.player.name} joined the crew.`, "success");
  } else {
    crew = crew.filter((player) => player.id !== event.player.id);
    showFeedback(`${event.player.name} left the crew.`, "neutral");
  }
  renderRoom();
  if (gameplayAdapter) {
    gameplayAdapter.publish({ ...gameplayAdapter.getSnapshot(), players: createPreviewSnapshot(crew).players });
  }
}

function startGameplayPreview(): void {
  if (!roomCode || gameplayAdapter) return;
  gameplayAdapter = new MockGameStateAdapter(createPreviewSnapshot(crew));
  for (const selector of [".hero", ".preview-note", ".lobby-grid", "#feedback", "#crew-room"]) {
    app.querySelector<HTMLElement>(selector)!.hidden = true;
  }
  gameScreen.hidden = false;
  disposeGameplay = mountGameplayView(gameScreen, gameplayAdapter, {
    roomCode,
    onExit: returnToCrew,
    onPreviewAction: applyPreviewAction,
  });
  const localPlayer = crew.find((player) => player.id === ownId);
  if (localPlayer) {
    playerPreview = new PlayerPreviewController(ownId, gameplayAdapter);
    let previousFrame = performance.now();
    const updateLocalPlayer = (now: number) => {
      if (!playerPreview) return;
      playerPreview.update(now - previousFrame);
      previousFrame = now;
      playerPreviewFrame = requestAnimationFrame(updateLocalPlayer);
    };
    playerPreviewFrame = requestAnimationFrame(updateLocalPlayer);
  }
}

function returnToCrew(): void {
  cancelAnimationFrame(playerPreviewFrame);
  playerPreview?.dispose();
  playerPreview = undefined;
  disposeGameplay?.();
  disposeGameplay = undefined;
  gameplayAdapter = undefined;
  gameScreen.hidden = true;
  for (const selector of [".hero", ".preview-note", ".lobby-grid", "#feedback", "#crew-room"]) {
    app.querySelector<HTMLElement>(selector)!.hidden = false;
  }
}

function applyPreviewAction(action: PreviewAction): void {
  if (!gameplayAdapter) return;
  const state = gameplayAdapter.getSnapshot();
  if (action === "reset") {
    gameplayAdapter.publish(createPreviewSnapshot(crew));
  } else if (action === "advance-time") {
    gameplayAdapter.publish({ ...state, secondsRemaining: Math.max(0, state.secondsRemaining - 15) });
  } else if (action === "damage-train") {
    gameplayAdapter.publish({ ...state, trainCondition: Math.max(0, state.trainCondition - 20) });
  } else if (action === "progress-repair") {
    const index = state.tasks.findIndex((task) => task.status !== "complete");
    if (index < 0) return;
    const tasks = state.tasks.map((task) => ({ ...task }));
    const task = tasks[index];
    task.progress = Math.min(100, task.progress + 25);
    task.status = task.progress === 100 ? "complete" : "in-progress";
    const completed = tasks.filter((candidate) => candidate.status === "complete").length;
    gameplayAdapter.publish({ ...state, tasks, repairs: { ...state.repairs, completed } });
  } else if (action === "win") {
    gameplayAdapter.publish({ ...state, outcome: { kind: "victory", message: "Your crew brought the Night Line safely through." } });
  } else if (action === "fail") {
    gameplayAdapter.publish({ ...state, outcome: { kind: "failure", message: "The train lost power before reaching the station." } });
  }
}

function renderRoom(): void {
  room.hidden = !roomCode || Boolean(gameplayAdapter);
  app.querySelector<HTMLElement>("#active-code")!.textContent = roomCode;
  app.querySelector<HTMLElement>("#room-capacity")!.textContent = `${crew.length} / 4 CREW ABOARD`;
  playerList.innerHTML = crew.slice(0, 4).map((player, index) => `
    <li class="player-row ${player.id === ownId ? "is-you" : ""}">
      <span class="player-number">0${index + 1}</span>
      <span class="avatar" aria-hidden="true">${escapeHtml(player.name.slice(0, 1).toUpperCase())}</span>
      <span class="player-name">${escapeHtml(player.name)}${player.id === ownId ? '<span class="you-tag">YOU</span>' : ""}</span>
      <span class="player-status"><span class="live-dot"></span>${player.connected ? "CONNECTED" : "RECONNECTING"}</span>
    </li>`).join("") + Array.from({ length: Math.max(0, 4 - crew.length) }, (_, index) => `
    <li class="player-row player-empty"><span class="player-number">0${crew.length + index + 1}</span><span class="empty-seat">Awaiting crew member<span class="seat-dots">···</span></span><span class="player-status">OPEN SEAT</span></li>`).join("");
}

function setPending(value: boolean): void {
  createButton.disabled = value;
  joinButton.disabled = value;
  createButton.querySelector("span")!.textContent = value ? "One moment…" : "Create a session";
  joinButton.querySelector("span")!.textContent = value ? "One moment…" : "Join session";
}

function showFeedback(message: string, kind: "neutral" | "success" | "error"): void {
  feedback.textContent = message;
  feedback.dataset.kind = kind;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
