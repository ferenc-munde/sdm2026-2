import { randomInt } from "node:crypto";
import type { Replay } from "@sdm/core/shared";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

/** Counters of one live room, as reported by `GET /api/stats` and the periodic room log line. */
export interface RoomStats {
  roomId: string;
  code: string;
  players: number;
  tick: number;
  /** Ticks run since the room was created, and how many of them started more than half a tick late. */
  ticks: number;
  lateTicks: number;
  avgTickMs: number;
  maxTickMs: number;
  inputsApplied: number;
  inputsRejected: number;
  /** Inputs dropped because a client sent more than the per-second limit. */
  inputsDropped: number;
  reconnects: number;
}

export interface RegisteredRoom {
  roomId: string;
  isFull(): boolean;
  stats(): RoomStats;
  /** The replay recorded so far. */
  replay(): Replay;
}

/** Maps the short room code players type in to the live room. */
export class RoomRegistry {
  private readonly rooms = new Map<string, RegisteredRoom>();

  register(room: RegisteredRoom): string {
    let code = "";
    do {
      code = Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
    } while (this.rooms.has(code));
    this.rooms.set(code, room);
    return code;
  }

  get(code: string): RegisteredRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  byRoomId(roomId: string): RegisteredRoom | undefined {
    return this.list().find((room) => room.roomId === roomId);
  }

  list(): RegisteredRoom[] {
    return [...this.rooms.values()];
  }

  unregister(code: string): void {
    this.rooms.delete(code);
  }
}
