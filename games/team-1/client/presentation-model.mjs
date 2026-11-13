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
