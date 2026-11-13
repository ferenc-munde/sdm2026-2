// The main menu's logic, without the DOM (#12).
//
// Pure functions so the validation and the error copy can be tested. `lobby.ts`
// only renders what these return and calls the create/join handlers.

import { JOIN_CODE_LENGTH, PLAYER_NAME_MAX_LENGTH } from "../shared/constants.ts";
import type { ErrorCode } from "../shared/messages.ts";

/** What the player typed. */
export interface LobbyForm {
  name: string;
  code: string;
}

/** Trims the name; inner spaces are the player's business. */
export function normaliseName(raw: string): string {
  return raw.trim();
}

/** Upper-cases the code and keeps only letters and digits, cut to the code length. */
export function normaliseCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, JOIN_CODE_LENGTH);
}

/** Why the name cannot be used, or null when it can. */
export function nameProblem(raw: string): string | null {
  const name = normaliseName(raw);
  if (name.length === 0) return "Enter a name first.";
  if (name.length > PLAYER_NAME_MAX_LENGTH) return `Keep the name to ${PLAYER_NAME_MAX_LENGTH} characters.`;
  return null;
}

/** Why the code cannot be used, or null when it can. */
export function codeProblem(raw: string): string | null {
  const code = normaliseCode(raw);
  if (code.length !== JOIN_CODE_LENGTH) return `The code is ${JOIN_CODE_LENGTH} characters.`;
  return null;
}

/** Can the player create a room with this form? */
export function canCreate(form: LobbyForm): boolean {
  return nameProblem(form.name) === null;
}

/** Can the player join with this form? */
export function canJoin(form: LobbyForm): boolean {
  return nameProblem(form.name) === null && codeProblem(form.code) === null;
}

/** The line shown for an error the room sent back. */
export function errorText(code: ErrorCode): string {
  switch (code) {
    case "roomNotFound":
      return "No room with that code. Check it and try again.";
    case "roomFull":
      return "That room is full (4 players).";
    case "gameInProgress":
      return "That run has already started.";
    case "invalidName":
      return "That name was not accepted. Use 1–16 characters.";
    case "notEnoughPlayers":
      return "The crew isn't complete yet. Wait for everyone to join.";
    case "notHost":
      return "Only the host can do that.";
    case "invalidMessage":
      return "The room did not accept that. Try again.";
    case "notHost":
      return "Only the host can do that.";
    default:
      return "Something went wrong. Try again.";
  }
}
