import type { GamePlayer, GameClientSnapshot, GameOutcome, GameTask } from "./game-state-adapter.mjs";

export type PlayerViewModel = Omit<GamePlayer, "position"> & { x: number; z: number };
export declare function toPlayerViewModels(snapshot: GameClientSnapshot): Array<PlayerViewModel>;
export declare function formatCountdown(seconds: number): string;
export declare function conditionBand(condition: number): "stable" | "strained" | "critical";
export declare function toOutcomeViewModel(outcome: GameOutcome): { title: string; tone: "victory" | "failure"; message: string } | null;
export declare function toTaskViewModels(tasks: GameTask[]): Array<GameTask & { statusLabel: "DONE" | "IN PROGRESS" | "OPEN" }>;
