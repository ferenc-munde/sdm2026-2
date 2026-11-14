import { COURSE_HOLD_WINDOW_SECONDS, COURSE_HULL_DAMAGE } from "../shared/constants.ts";
import type { GameState } from "../shared/types.ts";

export function courseWarningView(state: GameState): { seconds: number; progress: number; holdNow: boolean } | null {
  if (state.phase !== "playing") return null;
  const hazard = Object.values(state.hazards)
    .filter(h => h.kind === "course" && h.countdown !== null && Number.isFinite(h.countdown) && h.countdown > 0)
    .sort((a, b) => a.countdown! - b.countdown! || a.id.localeCompare(b.id))[0];
  if (!hazard) return null;
  return {
    seconds: Math.ceil(hazard.countdown!),
    progress: Number.isFinite(hazard.progress) ? Math.max(0, Math.min(1, hazard.progress)) : 0,
    holdNow: hazard.countdown! <= COURSE_HOLD_WINDOW_SECONDS,
  };
}

/** Render server countdown/progress; never run a separate browser-side hazard timer. */
export function createCourseWarning(container: HTMLElement) {
  const panel = document.createElement("aside");
  panel.setAttribute("aria-label", "Course warning");
  panel.style.cssText = "position:fixed;bottom:96px;left:50%;transform:translateX(-50%);" +
    "max-width:80vw;padding:16px;border:2px solid #ffbd69;border-radius:8px;" +
    "background:#291c13;color:#fff;font:16px system-ui;text-align:center;z-index:14";
  const instruction = document.createElement("p");
  instruction.setAttribute("role", "status");
  const countdown = document.createElement("p");
  const progress = document.createElement("progress");
  progress.max = 1;
  progress.setAttribute("aria-label", "Steering hold progress");
  panel.append(instruction, countdown, progress);
  panel.hidden = true;
  container.append(panel);
  return {
    update(state: GameState): void {
      const view = courseWarningView(state);
      panel.hidden = view === null;
      if (!view) return;
      const text = view.holdNow ? "Sharp curve ahead: HOLD Space / E at the brake lever now!" : "Sharp curve ahead — get to the brake lever!";
      if (instruction.textContent !== text) instruction.textContent = text;
      countdown.textContent = `${view.seconds} seconds remaining · hold through the final ${COURSE_HOLD_WINDOW_SECONDS} seconds to avoid ${COURSE_HULL_DAMAGE} hull damage`;
      progress.value = view.progress;
    },
    dispose(): void { panel.remove(); },
  };
}
