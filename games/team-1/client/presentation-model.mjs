export function toPlayerViewModels(snapshot) {
  return snapshot.players.slice(0, 4).map((player) => ({
    id: player.id,
    name: player.name,
    connected: player.connected,
    color: player.color,
    x: Math.min(1, Math.max(0, player.position.x)),
    z: Math.min(1, Math.max(0, player.position.z)),
  }));
}

export function formatCountdown(seconds) {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60).toString().padStart(2, "0");
  const remainder = (safeSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

export function conditionBand(condition) {
  if (condition <= 25) return "critical";
  if (condition <= 60) return "strained";
  return "stable";
}

export function toOutcomeViewModel(outcome) {
  if (outcome.kind === "victory") return { title: "THE LINE HOLDS", tone: "victory", message: outcome.message };
  if (outcome.kind === "failure") return { title: "THE TRAIN HAS STALLED", tone: "failure", message: outcome.message };
  return null;
}

export function toTaskViewModels(tasks) {
  return tasks.map((task) => ({
    ...task,
    progress: Math.min(100, Math.max(0, task.progress)),
    statusLabel: task.status === "complete" ? "DONE" : task.status === "in-progress" ? "IN PROGRESS" : "OPEN",
  }));
}
