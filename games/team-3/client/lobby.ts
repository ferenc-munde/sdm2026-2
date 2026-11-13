// The main menu (#12): enter a name, create a room, or join with a code.
//
// The screen only validates and calls the handlers; the room transport is
// #145/#80. `updateError` shows whatever the server sends back via `error`.

import type { ErrorCode } from "../shared/messages.ts";
import {
  codeProblem,
  errorText,
  nameProblem,
  normaliseCode,
  normaliseName,
} from "./lobbyModel.ts";
import { buildRoomLink } from "./roomLinks.ts";

export interface LobbyHandlers {
  onCreate(name: string): void;
  onJoin(name: string, code: string): void;
}

export interface Lobby {
  root: HTMLElement;
  /** Replaces the form with the created room and its code. */
  showRoom(code: string): void;
  /** Shows an error coming from the room. */
  updateError(code: ErrorCode): void;
  /** Shows a plain status line (for example "Connecting…"). */
  setStatus(text: string): void;
  /** Back to the form, with the error cleared. */
  reset(): void;
  /** Hides the menu, for example once the room is joined. */
  hide(): void;
  dispose(): void;
}

/** Creates the menu inside `container`; it covers the page until `hide()`. */
export function createLobby(container: HTMLElement, handlers: LobbyHandlers): Lobby {
  const root = document.createElement("div");
  root.className = "lobby";

  const panel = document.createElement("section");
  panel.className = "lobby-panel";
  panel.setAttribute("aria-labelledby", "lobby-title");

  const title = document.createElement("h2");
  title.id = "lobby-title";
  title.textContent = "The Last Train";

  const intro = document.createElement("p");
  intro.textContent = "Crew of 2–4. Bring the train home together.";

  const form = document.createElement("form");
  form.className = "lobby-form";
  form.noValidate = true;

  const nameLabel = document.createElement("label");
  nameLabel.htmlFor = "lobby-name";
  nameLabel.textContent = "Your name";
  const nameInput = document.createElement("input");
  nameInput.id = "lobby-name";
  nameInput.name = "name";
  nameInput.autocomplete = "off";
  nameInput.maxLength = 16;
  nameInput.placeholder = "Ada";

  const createButton = document.createElement("button");
  createButton.type = "button";
  createButton.className = "lobby-create";
  createButton.textContent = "Create room";

  const divider = document.createElement("p");
  divider.className = "lobby-divider";
  divider.textContent = "or join a crew";

  const codeLabel = document.createElement("label");
  codeLabel.htmlFor = "lobby-code";
  codeLabel.textContent = "Room code";
  const codeInput = document.createElement("input");
  codeInput.id = "lobby-code";
  codeInput.name = "code";
  codeInput.autocomplete = "off";
  codeInput.maxLength = 4;
  codeInput.placeholder = "K7QF";
  codeInput.className = "lobby-code";

  const joinButton = document.createElement("button");
  joinButton.type = "button";
  joinButton.className = "lobby-join";
  joinButton.textContent = "Join room";

  const status = document.createElement("p");
  status.className = "lobby-status";
  status.setAttribute("role", "status");
  status.hidden = true;

  const error = document.createElement("p");
  error.className = "lobby-error";
  error.setAttribute("role", "alert");
  error.hidden = true;

  form.append(nameLabel, nameInput, createButton, divider, codeLabel, codeInput, joinButton);
  panel.append(title, intro, form, status, error);

  // The room panel, shown after the room exists.
  const room = document.createElement("div");
  room.className = "lobby-room";
  room.hidden = true;
  const roomTitle = document.createElement("h2");
  const roomCode = document.createElement("p");
  roomCode.className = "lobby-room-code";
  const roomHint = document.createElement("p");
  roomHint.textContent = "Share this code with your crew.";
  const roomLink = document.createElement("p");
  roomLink.className = "lobby-room-link";
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.textContent = "Back";
  room.append(roomTitle, roomCode, roomHint, roomLink, backButton);
  panel.append(room);

  root.append(panel);
  container.append(root);

  const showError = (text: string): void => {
    error.textContent = text;
    error.hidden = false;
    status.hidden = true;
  };

  const clearError = (): void => {
    error.hidden = true;
  };

  // Never let the browser navigate away with the form (it is a native form so
  // Enter and autofill work); the buttons drive the flow.
  form.addEventListener("submit", (event) => event.preventDefault());

  const createRoom = (): void => {
    const problem = nameProblem(nameInput.value);
    if (problem !== null) return showError(problem);
    clearError();
    handlers.onCreate(normaliseName(nameInput.value));
  };

  const joinRoom = (): void => {
    const problem = nameProblem(nameInput.value) ?? codeProblem(codeInput.value);
    if (problem !== null) return showError(problem);
    clearError();
    handlers.onJoin(normaliseName(nameInput.value), normaliseCode(codeInput.value));
  };

  createButton.addEventListener("click", createRoom);
  joinButton.addEventListener("click", joinRoom);

  nameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      createRoom();
    }
  });
  codeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      joinRoom();
    }
  });

  // Keep the code readable: upper-case and strip separators as the player types.
  codeInput.addEventListener("input", () => {
    const clean = normaliseCode(codeInput.value);
    if (codeInput.value !== clean) codeInput.value = clean;
    clearError();
  });
  nameInput.addEventListener("input", clearError);

  backButton.addEventListener("click", () => {
    room.hidden = true;
    form.hidden = false;
    clearError();
  });

  return {
    root,
    showRoom(code: string): void {
      form.hidden = true;
      status.hidden = true;
      error.hidden = true;
      roomTitle.textContent = "Room ready";
      roomCode.textContent = code;
      roomLink.textContent = buildRoomLink(window.location.href, code);
      room.hidden = false;
    },
    updateError(code: ErrorCode): void {
      showError(errorText(code));
    },
    setStatus(text: string): void {
      error.hidden = true;
      status.textContent = text;
      status.hidden = text.length === 0;
    },
    reset(): void {
      room.hidden = true;
      form.hidden = false;
      clearError();
      status.hidden = true;
    },
    hide(): void {
      root.hidden = true;
    },
    dispose(): void {
      root.remove();
    },
  };
}


