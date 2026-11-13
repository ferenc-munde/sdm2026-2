import { randomInt } from "node:crypto";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 4;

export interface RegisteredRoom {
  roomId: string;
  isFull(): boolean;
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

  unregister(code: string): void {
    this.rooms.delete(code);
  }
}
