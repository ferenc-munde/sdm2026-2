/**
 * The station minigame modal: opens a task's minigame from the registry and
 * turns a completed minigame into exactly one `progress` input. Closing the
 * modal at any point sends nothing — an unfinished minigame never counts
 * (issue #76). Also hosts the two tiny tasks-UI notices: the "E — <task>"
 * station prompt and the new-task toast. Styles are injected here so hud.css
 * stays untouched.
 */
import { MINIGAMES } from "./minigames/registry.ts";
import type { Minigame } from "./minigames/types.ts";

export interface OpenTask {
  readonly id: string;
  readonly title: string;
  readonly type: string;
  readonly minigame: string;
  readonly current: number;
  readonly target: number;
}

const STYLES = `
.ltm-backdrop{position:fixed;inset:0;background:rgba(10,12,10,.72);display:flex;align-items:center;justify-content:center;z-index:60}
.ltm-panel{background:#1d2523;border:2px solid #e4b552;border-radius:10px;min-width:320px;max-width:440px;padding:16px 18px;color:#fff1ca;font-family:monospace}
.ltm-head{display:flex;justify-content:space-between;gap:12px;align-items:baseline;margin-bottom:10px}
.ltm-title{font-weight:bold}
.ltm-kind{opacity:.75;font-size:11px;letter-spacing:.08em}
.ltm-close{background:none;border:1px solid #676f63;border-radius:6px;color:#fff1ca;cursor:pointer;font-family:inherit}
.ltm-steps{font-size:12px;color:#e4b552}
.ltm-body{display:flex;flex-direction:column;gap:12px;align-items:center}
.ltm-hint{margin:0;font-size:12px;color:#c8cbb8}
.ltm-wires{display:grid;grid-template-columns:auto auto;gap:10px 64px}
.ltm-node{width:46px;height:22px;border:2px solid #141a17;border-radius:5px;cursor:pointer;background:var(--node)}
.ltm-node.ltm-picked{outline:2px solid #fff1ca}
.ltm-node.ltm-matched{outline:2px solid #71a98d;cursor:default}
.ltm-crank{background:#313b39;border:2px solid #a43730;border-radius:8px;color:#fff1ca;font-family:inherit;font-size:18px;font-weight:bold;padding:12px 26px;cursor:pointer}
.ltm-bar{width:260px;height:16px;border:1px solid #676f63;border-radius:8px;overflow:hidden;background:#141a17}
.ltm-bar-fill{height:100%;background:#cc8c45;transition:width .12s}
.ltm-grid{display:grid;grid-template-columns:repeat(3,64px);gap:8px}
.ltm-tile{width:64px;height:64px;border-radius:6px;border:2px solid #323d36;background:#232a29;cursor:pointer}
.ltm-tile.ltm-on{background:#e4b552;border-color:#8a6a1e}
.ltm-prompt{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);background:#1d2523;border:1px solid #e4b552;border-radius:8px;padding:6px 14px;color:#fff1ca;font-family:monospace;font-size:13px;z-index:50}
.ltm-toasts{position:fixed;left:50%;top:14px;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;z-index:50}
.ltm-toast{background:#1d2523;border:1px solid #71a98d;border-radius:8px;padding:6px 14px;color:#fff1ca;font-family:monospace;font-size:13px;opacity:0;transition:opacity .3s}
`;

let styleInjected = false;
let openPanel: { close(): void } | undefined;

function injectStyles(): void {
  if (styleInjected) return;
  const style = document.createElement("style");
  style.textContent = STYLES;
  document.head.append(style);
  styleInjected = true;
}

/** Open the minigame for `task`; `onProgress` fires once per completed step. */
export function openTaskModal(
  task: OpenTask,
  onProgress: (amount: number) => void,
  hooks: { onClosed?: () => void } = {},
): void {
  closeTaskModal();
  injectStyles();

  const factory = MINIGAMES[task.minigame];
  if (!factory) throw new Error(`no minigame registered for "${task.minigame}"`);

  const backdrop = document.createElement("div");
  backdrop.className = "ltm-backdrop";
  const panel = document.createElement("div");
  panel.className = "ltm-panel";
  const head = document.createElement("div");
  head.className = "ltm-head";
  const title = document.createElement("span");
  title.className = "ltm-title";
  title.textContent = task.title;
  const kind = document.createElement("span");
  kind.className = "ltm-kind";
  kind.textContent = task.type;
  const steps = document.createElement("span");
  steps.className = "ltm-steps";
  const remaining = Math.max(0, task.target - task.current);
  steps.textContent = remaining === 1 ? "1 step left" : `${remaining} steps left`;
  const close = document.createElement("button");
  close.type = "button";
  close.className = "ltm-close";
  close.textContent = "✕";
  close.setAttribute("aria-label", "Close minigame");
  head.append(title, kind, steps, close);
  const body = document.createElement("div");
  body.className = "ltm-body";
  panel.append(head, body);
  backdrop.append(panel);

  let minigame: Minigame | undefined;
  let settled = false;

  function closePanel(): void {
    if (!openPanel || openPanel.close !== closePanel) return;
    openPanel = undefined;
    minigame?.destroy();
    backdrop.remove();
    window.removeEventListener("keydown", onKey);
    hooks.onClosed?.();
  }

  function onKey(event: KeyboardEvent): void {
    if (event.key === "Escape") closePanel();
  }

  close.addEventListener("click", closePanel);
  backdrop.addEventListener("click", (event) => {
    if (event.target === backdrop) closePanel();
  });
  window.addEventListener("keydown", onKey);

  minigame = factory(body, {
    taskId: task.id,
    title: task.title,
    type: task.type,
    stepsLeft: remaining,
    done() {
      if (settled) return;
      settled = true;
      onProgress(1);
      closePanel();
    },
  });

  document.body.append(backdrop);
  openPanel = { close: closePanel };
}

export function closeTaskModal(): void {
  openPanel?.close();
}

/** The "E — <task>" hint near the bottom of the scene; null hides it. */
export function showStationPrompt(text: string | null): void {
  injectStyles();
  let prompt = document.querySelector<HTMLElement>(".ltm-prompt");
  if (!text) {
    prompt?.remove();
    return;
  }
  if (!prompt) {
    prompt = document.createElement("div");
    prompt.className = "ltm-prompt";
    document.body.append(prompt);
  }
  prompt.textContent = text;
}

/** A short-lived "new task" notice at the top of the scene. */
export function showTaskToast(text: string): void {
  injectStyles();
  let stack = document.body.querySelector<HTMLElement>(".ltm-toasts");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "ltm-toasts";
    document.body.append(stack);
  }
  const toast = document.createElement("div");
  toast.className = "ltm-toast";
  toast.textContent = text;
  stack.append(toast);
  window.requestAnimationFrame(() => { toast.style.opacity = "1"; });
  window.setTimeout(() => { toast.style.opacity = "0"; }, 2600);
  window.setTimeout(() => {
    toast.remove();
    if (!stack!.childElementCount) stack!.remove();
  }, 3100);
}
