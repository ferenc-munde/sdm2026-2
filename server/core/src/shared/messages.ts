import { z } from "zod";

export const MESSAGES = {
  input: "input",
  debug: "debug",
  notice: "notice",
} as const;

/** The room name every game registers on the host and every client creates or joins. */
export const GAME_ROOM_NAME = "game";

export const ROUTES = {
  health: "/health",
  joinRoom: "/api/rooms/join",
  replay: (roomId: string) => `/api/replays/${roomId}`,
  bugReports: "/api/bug-reports",
  stats: "/api/stats",
} as const;

/** Every client message is wrapped in this envelope; `seq` rises by one per message. */
export const InputEnvelopeSchema = z.object({
  seq: z.number().int().nonnegative(),
  input: z.unknown(),
});
export type InputEnvelope = z.infer<typeof InputEnvelopeSchema>;

export const DebugCommandSchema = z.object({
  name: z.string().min(1).max(64),
  args: z.unknown().optional(),
});
export type DebugCommand = z.infer<typeof DebugCommandSchema>;

export const JoinRoomRequestSchema = z.object({ code: z.string().min(1).max(16) });
export type JoinRoomRequest = z.infer<typeof JoinRoomRequestSchema>;
export type JoinRoomResponse = { roomId: string };

export const BugReportSchema = z.object({
  roomId: z.string().min(1).optional(),
  message: z.string().min(1).max(2000),
});
export type BugReport = z.infer<typeof BugReportSchema>;
