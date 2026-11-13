import type { GamePlayer, GameClientSnapshot } from "./game-state-adapter.mjs";

export type PlayerViewModel = Omit<GamePlayer, "position"> & { x: number; z: number };
export declare function toPlayerViewModels(snapshot: GameClientSnapshot): Array<PlayerViewModel>;
