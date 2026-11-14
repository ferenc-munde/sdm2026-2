function copyState(state) {
  return {
    ...state,
    repairs: { ...state.repairs },
    players: state.players.map((player) => ({ ...player, position: { ...player.position } })),
    tasks: state.tasks.map((task) => ({ ...task })),
    outcome: { ...state.outcome },
  };
}

/**
 * Local-only gameplay state source for frontend previews and tests.
 * `publish` represents a received state snapshot; this class does not run a
 * simulation, connect a socket, or decide authoritative game outcomes.
 */
export class MockGameStateAdapter {
  state;
  listeners = new Set();

  constructor(initialState) {
    this.state = copyState(initialState);
  }

  getSnapshot() {
    return copyState(this.state);
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Inject a backend-shaped snapshot into the local preview. */
  publish(snapshot) {
    this.state = copyState(snapshot);
    for (const listener of this.listeners) listener(this.getSnapshot());
  }
}

/** Build a harmless default snapshot for the standalone UI preview. */
export function createPreviewSnapshot(players = []) {
  return {
    connectionState: "connected",
    players: players.map((player, index) => ({
      id: player.id,
      name: player.name,
      connected: player.connected,
      position: { x: 0.18 + index * 0.2, z: 0.5 },
      color: ["#d6ac68", "#8bb8a4", "#c78875", "#8f9dcc"][index % 4],
    })),
    secondsRemaining: 180,
    trainCondition: 100,
    repairs: { completed: 0, total: 5 },
    tasks: [
      { id: "wiring", label: "Reconnect the signal wires (Electrical Room)", section: "electrical", status: "available", progress: 0 },
      { id: "boiler", label: "Stabilize the boiler (Engine Room)", section: "engine", status: "available", progress: 0 },
      { id: "instruments", label: "Restore the control cabin instruments (Control Cabin)", section: "control", status: "available", progress: 0 },
      { id: "passenger-lights", label: "Fix the passenger carriage lights (Passenger Carriage)", section: "passenger", status: "available", progress: 0 },
      { id: "brakes", label: "Inspect the carriage brakes (Rear Carriage)", section: "rear", status: "available", progress: 0 },
    ],
    outcome: { kind: "playing", message: "Keep the train moving." },
  };
}
