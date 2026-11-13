// The waiting room (#146): the crew on the platform before departure.
//
// Shows the crew list, the crew-size setting (host only), the ticket with the
// share link, and the Depart button. The transport is the platform room (#80); this screen only
// renders a view and calls the handlers.

import { WIN_DISTANCE } from "../shared/constants.ts";
import { buildRoomLink } from "./roomLinks.ts";
import { waitingHint, type WaitingView } from "./waitingRoomModel.ts";

export interface WaitingRoomHandlers {
  onSize(size: number): void;
  onDepart(): void;
  onLeave(): void;
}

export interface WaitingRoom {
  root: HTMLElement;
  update(view: WaitingView): void;
  show(): void;
  hide(): void;
  dispose(): void;
}

export function createWaitingRoom(container: HTMLElement, handlers: WaitingRoomHandlers): WaitingRoom {
  const root = document.createElement("div");
  root.className = "waiting";
  root.hidden = true;

  const panel = document.createElement("section");
  panel.className = "waiting-panel";
  panel.setAttribute("aria-labelledby", "waiting-title");

  const title = document.createElement("h2");
  title.id = "waiting-title";
  title.textContent = "Waiting on the platform";

  const hint = document.createElement("p");
  hint.className = "waiting-hint";
  hint.setAttribute("role", "status");

  const journey = document.createElement("p");
  journey.className = "waiting-journey";
  journey.textContent = `Journey: ${WIN_DISTANCE} units to the station`;

  const crewList = document.createElement("ul");
  crewList.className = "waiting-crew";

  const sizeRow = document.createElement("div");
  sizeRow.className = "waiting-size-row";
  const sizeLabel = document.createElement("span");
  sizeLabel.textContent = "Crew size";
  sizeRow.append(sizeLabel);
  const sizeButtons: HTMLButtonElement[] = [];

  const ticket = document.createElement("div");
  ticket.className = "waiting-ticket";
  const ticketLabel = document.createElement("span");
  ticketLabel.textContent = "Ticket";
  const code = document.createElement("strong");
  code.className = "waiting-code";
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy link";
  const link = document.createElement("p");
  link.className = "waiting-link";
  ticket.append(ticketLabel, code, copy, link);

  const depart = document.createElement("button");
  depart.type = "button";
  depart.className = "waiting-depart";
  depart.textContent = "Depart the train";

  const leave = document.createElement("button");
  leave.type = "button";
  leave.className = "waiting-leave";
  leave.textContent = "Back to menu";

  const copyStatus = document.createElement("p");
  copyStatus.className = "waiting-copy-status";
  copyStatus.setAttribute("role", "status");
  copyStatus.hidden = true;

  panel.append(title, hint, journey, crewList, sizeRow, ticket, depart, leave, copyStatus);
  root.append(panel);
  container.append(root);

  let shareLink = "";

  for (let size = 2; size <= 4; size += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(size);
    button.className = "waiting-size";
    button.addEventListener("click", () => handlers.onSize(size));
    sizeButtons.push(button);
    sizeRow.append(button);
  }

  depart.addEventListener("click", () => handlers.onDepart());
  leave.addEventListener("click", () => handlers.onLeave());

  copy.addEventListener("click", () => {
    if (!shareLink) return;
    const done = (): void => {
      copyStatus.textContent = "Link copied.";
      copyStatus.hidden = false;
    };
    if (navigator.clipboard?.writeText) {
      void navigator.clipboard.writeText(shareLink).then(done, () => {
        copyStatus.textContent = "Press Ctrl+C to copy the link.";
        copyStatus.hidden = false;
      });
    } else {
      copyStatus.textContent = "Press Ctrl+C to copy the link.";
      copyStatus.hidden = false;
    }
  });

  const renderCrew = (view: WaitingView): void => {
    crewList.replaceChildren();
    for (const member of view.crew) {
      const row = document.createElement("li");
      row.className = "waiting-member";
      row.dataset.playerId = member.id;
      if (member.host) row.dataset.host = "true";
      if (!member.connected) row.dataset.disconnected = "true";
      row.textContent = member.name + (member.host ? " (host)" : "") + (member.connected ? "" : " (disconnected)");
      crewList.append(row);
    }
  };

  return {
    root,
    update(view: WaitingView): void {
      hint.textContent = waitingHint(view);
      renderCrew(view);

      sizeButtons.forEach((button, index) => {
        const size = index + 2;
        const option = view.sizeOptions.find((entry) => entry.size === size);
        button.disabled = !view.isHost || !option?.enabled;
        button.setAttribute("aria-pressed", String(view.crewSize === size));
        button.classList.toggle("active", view.crewSize === size);
      });

      code.textContent = view.code;
      shareLink = view.code ? buildRoomLink(window.location.href, view.code) : "";
      link.textContent = shareLink;
      copy.hidden = shareLink.length === 0;

      depart.disabled = !view.canDepart;
      depart.title = view.canDepart
        ? "Start the run"
        : view.isHost
          ? "The crew must be complete"
          : "Only the host can depart";
    },
    show(): void {
      root.hidden = false;
    },
    hide(): void {
      root.hidden = true;
      copyStatus.hidden = true;
    },
    dispose(): void {
      root.remove();
    },
  };
}
