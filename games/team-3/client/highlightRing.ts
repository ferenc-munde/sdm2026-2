// A flat ring on the floor under whatever the action key would use (#295).
//
// One ring per scene, hidden when there is no target. The material is unlit and drawn after the
// floor, so it reads on the dark cars and on the platform without changing any game object.

import { Color, DoubleSide, Group, Mesh, MeshBasicMaterial, RingGeometry } from "three";
import { HIGHLIGHT_COLORS, type ActionHighlight } from "./actionHighlight.ts";

export interface HighlightRing {
  group: Group;
  /** Places and pulses the ring, or hides it when `highlight` is null. */
  show(highlight: ActionHighlight | null, seconds: number): void;
  dispose(): void;
}

/** World units: wide enough to ring a 44-unit station pad, not so wide that it spills between cars. */
export const HIGHLIGHT_RADIUS = 34;

export function createHighlightRing(radius = HIGHLIGHT_RADIUS): HighlightRing {
  const group = new Group();
  group.name = "action-highlight";
  group.visible = false;
  group.renderOrder = 2;

  const material = new MeshBasicMaterial({
    color: new Color(HIGHLIGHT_COLORS.item),
    transparent: true,
    opacity: 0.9,
    side: DoubleSide,
    depthWrite: false,
  });
  const ring = new Mesh(new RingGeometry(radius * 0.7, radius, 32), material);
  ring.rotation.x = -Math.PI / 2;
  ring.name = "action-highlight-ring";
  group.add(ring);

  return {
    group,
    show(highlight, seconds) {
      if (!highlight) {
        group.visible = false;
        return;
      }
      group.visible = true;
      // Above the station pad (6 units tall) so the ring is not hidden by it.
      group.position.set(highlight.position.x, 6.5, highlight.position.y);
      const pulse = 1 + 0.06 * Math.sin(seconds * 6);
      group.scale.setScalar(pulse);
      material.color.set(HIGHLIGHT_COLORS[highlight.tone]);
    },
    dispose: () => {
      ring.geometry.dispose();
      material.dispose();
    },
  };
}
