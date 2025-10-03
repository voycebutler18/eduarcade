// src/features/player/FollowCam.tsx
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { MutableRefObject, useEffect, useRef } from "react";

export default function FollowCam({
  targetRef,
  offset = [0, 4.5, 8],          // default: above & a bit behind
  lerp = 0.12,                    // smoothing strength (0..1), higher = snappier
  relative = true,                // apply offset in target’s local space
  lookAtOffset = [0, 1.0, 0],     // where the camera looks (relative to target pos)
}: {
  targetRef: MutableRefObject<THREE.Object3D | null>;
  offset?: [number, number, number];
  lerp?: number;
  relative?: boolean;
  lookAtOffset?: [number, number, number];
}) {
  const { camera } = useThree();

  // stable vectors between frames
  const vTarget = useRef(new THREE.Vector3());
  const vDesired = useRef(new THREE.Vector3());
  const vOffset = useRef(new THREE.Vector3(...offset));
  const vLookAt = useRef(new THREE.Vector3(...lookAtOffset));
  const vTmp = useRef(new THREE.Vector3());

  // keep refs in sync if props change
  useEffect(() => {
    vOffset.current.set(offset[0], offset[1], offset[2]);
  }, [offset[0], offset[1], offset[2]]); // tuple-safe deps

  useEffect(() => {
    vLookAt.current.set(lookAtOffset[0], lookAtOffset[1], lookAtOffset[2]);
  }, [lookAtOffset[0], lookAtOffset[1], lookAtOffset[2]]);

  useFrame((_, dt) => {
    const obj = targetRef.current;
    if (!obj) return;

    // base target point
    vTarget.current.copy(obj.position);

    // compute desired camera position
    if (relative) {
      // rotate offset by the target’s rotation so the camera stays behind it
      vDesired.current.copy(vOffset.current).applyQuaternion(obj.quaternion).add(vTarget.current);
    } else {
      // world-space offset (doesn't rotate with the player)
      vDesired.current.copy(vTarget.current).add(vOffset.current);
    }

    // dt-aware smoothing: consistent feel across frame rates
    const factor = 1 - Math.pow(1 - lerp, Math.min(1, dt * 60));
    camera.position.lerp(vDesired.current, factor);

    // look at a point a bit above the target’s origin (e.g., chest/eyes)
    vTmp.current.copy(vLookAt.current).add(vTarget.current);
    camera.lookAt(vTmp.current);
  });

  return null;
}
