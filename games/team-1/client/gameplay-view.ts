import type { GameStateAdapter } from "./game-state-adapter.mjs";
import { mountTrainScene } from "./player-scene";

export type SceneViewOptions = {
  roomCode: string;
  onExit: () => void;
};

/** Mounts a rendering-only scene; all player transforms arrive in snapshots. */
export function mountSceneView(root: HTMLElement, adapter: GameStateAdapter, options: SceneViewOptions): () => void {
  root.innerHTML = `
    <div class="game-heading">
      <div><div class="panel-index">DEPARTURE IN PROGRESS</div><h2>The Night Line</h2></div>
      <button id="return-crew" class="leave-button" type="button">Back to crew <span aria-hidden="true">↗</span></button>
    </div>
    <div class="game-room-code">CREW CODE <strong>${escapeHtml(options.roomCode)}</strong><span>LOCAL MOCK STATE</span></div>
    <section class="scene-panel" aria-label="Train and player view">
      <canvas id="train-canvas" class="train-canvas" aria-label="Three-dimensional cutaway view of the train and crew"></canvas>
      <div id="scene-fallback" class="scene-fallback" hidden>3D view is unavailable in this browser. The synchronized state remains connected to the client.</div>
      <div class="scene-label"><span class="live-dot"></span> CARRIAGE 01 <span>·</span> NIGHT LINE</div>
    </section>
    <p class="scene-caption">Player avatars follow typed game-state snapshots. This local preview does not connect to a server.</p>
  `;

  const canvas = root.querySelector<HTMLCanvasElement>("#train-canvas")!;
  const fallback = root.querySelector<HTMLElement>("#scene-fallback")!;
  const scene = mountTrainScene(canvas, fallback);
  const unsubscribe = adapter.subscribe((snapshot) => scene.update(snapshot));
  root.querySelector<HTMLButtonElement>("#return-crew")!.addEventListener("click", options.onExit);
  scene.update(adapter.getSnapshot());

  return () => {
    unsubscribe();
    scene.dispose();
    root.replaceChildren();
  };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}
