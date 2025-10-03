
// src/features/player/FollowCam.tsx
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { RefObject, useMemo } from "react";

/**
 * Safe follow camera:
 * - If targetRef.current is missing, it does nothing (prevents crashes)
 * - Smoothly lerps position toward target + offset, and looks at target
 */
export default function FollowCam({
  targetRef,
  offset = [0, 4.5, 8],    // behind & above
  lerp = 0.12,
}: {
  targetRef: RefObject<THREE.Object3D>;
  offset?: [number, number, number];
  lerp?: number;
}) {
  const { camera } = useThree();

  // Reuse vectors, avoid GC
  const helpers = useMemo(
    () => ({
      targetPos: new THREE.Vector3(),
      desired: new THREE.Vector3(),
      off: new THREE.Vector3(...offset),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  // If offset prop changes later, update the helper
  helpers.off.set(offset[0], offset[1], offset[2]);

  useFrame(() => {
    const t = targetRef.current;
    if (!t) return; // <-- null-safe

    // where the target is
    t.getWorldPosition(helpers.targetPos);

    // where we want the camera to be
    helpers.desired.copy(helpers.targetPos).add(helpers.off);

    // move camera smoothly
    camera.position.lerp(helpers.desired, lerp);

    // look at the target
    camera.lookAt(helpers.targetPos);
  });

  return null;
}
