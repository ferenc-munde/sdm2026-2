/**
 * One minigame = one file, registered in registry.ts by id. A minigame is pure
 * client UI: it mounts into a host element and calls `context.done()` at most
 * once when the player completes it. The server only ever sees the resulting
 * `progress` input, so a closed or failed minigame sends nothing.
 */
export interface MinigameContext {
  /** Live snapshot of the task that opened this minigame. */
  readonly taskId: string;
  readonly title: string;
  readonly type: string;
  /** Steps still missing (target - current at open time). */
  readonly stepsLeft: number;
  /** Call exactly once per completed step; extra calls are ignored by the modal. */
  done(): void;
}

export interface Minigame {
  /** Release every listener/DOM node this minigame created. The modal removes `host` itself. */
  destroy(): void;
}

export type MinigameFactory = (host: HTMLElement, context: MinigameContext) => Minigame;
