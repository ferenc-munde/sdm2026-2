import { PLAYER_NAME_MAX_LENGTH } from "../shared/constants.ts";
import { joinErrorText, parseRoomLink, type JoinLinkedRoom } from "./roomLinks.ts";

export interface SharedLinkOptions {
  address: string;
  join: JoinLinkedRoom;
  /** Called for invalid/expired links, cancellation or a failed connection. */
  onMainMenu: (message?: string) => void;
  onJoined: () => void;
}

/** Mount before the normal menu; returns null when there is no shared room link. */
export function createSharedLinkJoin(container: HTMLElement, options: SharedLinkOptions) {
  const parsed = parseRoomLink(options.address);
  if (parsed.kind === "none") return null;
  if (parsed.kind === "invalid") {
    options.onMainMenu("That room link is invalid. Enter a room code or create a room.");
    return null;
  }
  const panel = document.createElement("section");
  panel.setAttribute("aria-label", "Join shared room");
  panel.style.cssText = "position:fixed;inset:0;z-index:30;background:#141824;color:#fff;" +
    "display:grid;place-content:center;gap:16px;padding:24px;font:16px system-ui";
  const heading = document.createElement("h1");
  heading.textContent = `Join room ${parsed.code}`;
  const form = document.createElement("form");
  const label = document.createElement("label");
  label.textContent = "Your name ";
  const name = document.createElement("input");
  name.name = "name";
  name.required = true;
  name.maxLength = PLAYER_NAME_MAX_LENGTH;
  name.setAttribute("autocomplete", "nickname");
  label.append(name);
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Join room";
  const back = document.createElement("button");
  back.type = "button";
  back.textContent = "Back to main menu";
  const status = document.createElement("p");
  status.setAttribute("role", "status");
  let disposed = false;
  let pending = false;
  const dispose = (): void => { disposed = true; panel.remove(); };
  back.addEventListener("click", () => { dispose(); options.onMainMenu(); });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (pending || disposed) return;
    const playerName = name.value.trim();
    if (!playerName) { status.textContent = "Enter your name to join."; name.focus(); return; }
    pending = true;
    submit.disabled = true;
    status.textContent = "Joining room…";
    void Promise.resolve().then(() => options.join(playerName, parsed.code)).then(result => {
      if (disposed) return;
      dispose();
      if (result.ok) options.onJoined();
      else options.onMainMenu(joinErrorText(result.error));
    }).catch(() => {
      if (disposed) return;
      dispose();
      options.onMainMenu(joinErrorText("connectionFailed"));
    });
  });
  form.append(label, submit);
  panel.append(heading, form, back, status);
  container.append(panel);
  name.focus();
  return { code: parsed.code, dispose };
}
