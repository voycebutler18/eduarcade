// src/features/world/CollidersDebug.tsx
import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import { useRef } from "react";

/**
 * CollidersDebug
 * - Visualizes simple bounding boxes around objects.
 * - Helps you debug PlayerController collisions (walls, obstacles).
 *
 * Usage:
 * <CollidersDebug objects={[mesh1, mesh2]} />
 */
export default function CollidersDebug({
  objects,
  color = "lime",
}: {
  objects: THREE.Object3D[];
  color?: string;
}) {
  const helpers = useRef<THREE.BoxHelper[]>([]);

  useFrame(() => {
    // Create missing helpers
    while (helpers.current.length < objects.length) {
      const h = new THREE.BoxHelper(objects[helpers.current.length], color);
      helpers.current.push(h);
      objects[helpers.current.length - 1].add(h);
    }

    // Update each
    helpers.current.forEach((h, i) => {
      if (objects[i]) {
        h.update();
      }
    });
  });

  return null;
}
