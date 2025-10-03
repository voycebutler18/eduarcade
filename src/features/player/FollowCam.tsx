import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import { useMemo } from "react";

/**
 * Smooth follow camera that targets a ref'd object.
 * Usage: <FollowCam targetRef={playerRef} offset={[0, 4.5, 8]} lerp={0.12} />
 */
export default function FollowCam({
  targetRef,
  offset = [0, 4, 8],
  lerp = 0.1,
}: {
  targetRef: React.RefObject<THREE.Object3D>;
  offset?: [number, number, number];
  lerp?: number;
}) {
  const { camera } = useThree();
  const off = useMemo(() => new THREE.Vector3(...offset), [offset]);

  useFrame(() => {
    const t = targetRef.current;
    if (!t) return;
    const targetPos = new THREE.Vector3();
    t.getWorldPosition(targetPos);

    const desired = targetPos.clone().add(off);
    camera.position.lerp(desired, lerp);
    camera.lookAt(targetPos);
  });

  return null;
}
