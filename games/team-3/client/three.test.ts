import { PerspectiveCamera, Scene, Vector3 } from "three";
import { describe, expect, it } from "vitest";

describe("three.js", () => {
  it("is installed and builds a scene without a browser", () => {
    const scene = new Scene();
    const camera = new PerspectiveCamera(50, 16 / 9, 0.1, 100);
    camera.position.set(0, 10, 10);
    camera.lookAt(new Vector3(0, 0, 0));
    scene.add(camera);
    expect(scene.children).toContain(camera);
  });
});
