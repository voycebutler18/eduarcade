import { useThree, useFrame } from "@react-three/fiber";
import * as THREE from "three";

export default function FollowCam({
  target,
  height = 5,
  back = 10,
  lerp = 0.14,
}: {
  target: { x: number; z: number };
  height?: number;
  back?: number;
  lerp?: number;
}) {
  const { camera } = useThree();

  useFrame(() => {
    // position camera slightly behind + above the player
    const want = new THREE.Vector3(target.x, height, target.z + back);
    camera.position.lerp(want, lerp);
    camera.lookAt(target.x, 1.2, target.z);
  });

  return null;
}
