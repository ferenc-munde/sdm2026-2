/** Pure shared-link helpers. Preserve the deployment path, including /team-3/. */
export type ParsedRoomLink = { kind: "none" } | { kind: "invalid" } | { kind: "room"; code: string };

export function normalizeRoomCode(value: string): string | null {
  const code = value.trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? code : null;
}

export function parseRoomLink(address: string): ParsedRoomLink {
  let url: URL;
  try { url = new URL(address); } catch { return { kind: "invalid" }; }
  const values = url.searchParams.getAll("room");
  if (!values.length) return { kind: "none" };
  if (values.length !== 1) return { kind: "invalid" };
  const code = normalizeRoomCode(values[0]!);
  return code ? { kind: "room", code } : { kind: "invalid" };
}

export function buildRoomLink(address: string, roomCode: string): string {
  const code = normalizeRoomCode(roomCode);
  if (!code) throw new Error("Invalid room code");
  const url = new URL(address);
  url.searchParams.set("room", code);
  url.hash = "";
  return url.href;
}

export type JoinLinkResult = { ok: true } | { ok: false; error: string };
export type JoinLinkedRoom = (name: string, code: string) => Promise<JoinLinkResult>;

/** A transport adapter may return the shared ErrorCode, or reject on connection loss. */
export function joinErrorText(error: string): string {
  if (error === "roomNotFound") return "That room code is wrong or has expired. Create a room or try another code.";
  if (error === "roomFull") return "That room is full. Ask the host for another room or create one.";
  if (error === "gameInProgress") return "That train has already departed. Join another room or create one.";
  if (error === "invalidName") return "Enter a valid player name.";
  return "Could not connect to that room. Please try again from the main menu.";
}
