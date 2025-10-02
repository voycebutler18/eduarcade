// src/features/campus/OutdoorWorld3D.tsx
import * as THREE from "three";
import { useEffect, useMemo } from "react";
import { Text } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";

/** --- Collision types (2D on XZ plane) --- */
export type BoxCollider = { kind: "box"; x: number; z: number; w: number; d: number };
export type CircleCollider = { kind: "circle"; x: number; z: number; r: number };
export type Collider = BoxCollider | CircleCollider;

export default function OutdoorWorld3D({
  onEnterSchool,
  onEnterPlot,
  myPlotId,
  ownedPlots = [],
  onReadyColliders,
}: {
  onEnterSchool?: () => void;
  onEnterPlot?: (plotId: string) => void;
  myPlotId?: string;
  ownedPlots?: string[];
  onReadyColliders?: (colliders: Collider[]) => void;
}) {
  /* ---------- Materials ---------- */
  const grassMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#9dd79b", roughness: 1 }),
    []
  );
  const roadMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#7b8794", roughness: 1 }),
    []
  );
  const sidewalkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#cfd7df", roughness: 0.95 }),
    []
  );
  const houseWallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#eae7e1", roughness: 0.85 }),
    []
  );
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#8b5e3b", roughness: 0.7 }),
    []
  );
  const doorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#94c5ff", roughness: 0.7, metalness: 0.1 }),
    []
  );
  const fenceMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#556270", roughness: 0.8 }),
    []
  );
  const plotMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#bfe6ff", transparent: true, opacity: 0.18 }),
    []
  );
  const plotOwnedMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#22c55e", transparent: true, opacity: 0.16 }),
    []
  );
  const plotMineMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#f59e0b", transparent: true, opacity: 0.2 }),
    []
  );

  const groundSize = 140;

  /* ---------- Layout ---------- */
  const houses = useMemo(
    () =>
      [
        { id: "H1", x: -30, z: 32, w: 10, d: 8, rot: Math.PI / 12 },
        { id: "H2", x: 28, z: -28, w: 9, d: 9, rot: -Math.PI / 8 },
        { id: "H3", x: -38, z: -20, w: 12, d: 8, rot: Math.PI / 6 },
      ] as const,
    []
  );

  const plots = useMemo(
    () =>
      [
        { id: "P1", x: -24, z: 8 },
        { id: "P2", x: -24, z: -8 },
        { id: "P3", x: 24, z: 8 },
        { id: "P4", x: 24, z: -8 },
        { id: "P5", x: -8, z: 24 },
        { id: "P6", x: 8, z: 24 },
        { id: "P7", x: -8, z: -24 },
        { id: "P8", x: 8, z: -24 },
      ] as const,
    []
  );

  const trees = useMemo(() => {
    const pts: Array<{ x: number; z: number; r: number }> = [];
    const rng = (seed: number) => () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const R = rng(1337);
    for (let i = 0; i < 160; i++) {
      const x = (R() - 0.5) * groundSize * 0.9;
      const z = (R() - 0.5) * groundSize * 0.9;
      if (Math.hypot(x, z) < 22) continue;
      pts.push({ x, z, r: 0.9 });
    }
    return pts;
  }, []);

  /* ---------- Colliders ---------- */
  const colliders: Collider[] = useMemo(() => {
    const list: Collider[] = [];
    for (const t of trees) list.push({ kind: "circle", x: t.x, z: t.z, r: t.r });

    for (const h of houses) {
      list.push({ kind: "box", x: h.x, z: h.z, w: h.w + 0.4, d: h.d + 0.4 });
      const fw = h.w + 6;
      const fd = h.d + 6;
      list.push({ kind: "box", x: h.x, z: h.z - fd / 2, w: fw, d: 0.4 });
      list.push({ kind: "box", x: h.x - (fw - 1.6) / 4, z: h.z + fd / 2, w: (fw - 1.6) / 2, d: 0.4 });
      list.push({ kind: "box", x: h.x + (fw - 1.6) / 4, z: h.z + fd / 2, w: (fw - 1.6) / 2, d: 0.4 });
      list.push({ kind: "box", x: h.x - fw / 2, z: h.z, w: 0.4, d: fd });
      list.push({ kind: "box", x: h.x + fw / 2, z: h.z, w: 0.4, d: fd });
    }

    for (const p of plots) {
      const outer = 14;
      list.push({ kind: "box", x: p.x, z: p.z - outer / 2, w: outer, d: 0.3 });
      list.push({ kind: "box", x: p.x, z: p.z + outer / 2, w: outer - 2, d: 0.3 });
      list.push({ kind: "box", x: p.x - outer / 2, z: p.z, w: 0.3, d: outer });
      list.push({ kind: "box", x: p.x + outer / 2, z: p.z, w: 0.3, d: outer });
    }

    list.push({ kind: "box", x: 0, z: -24, w: 6.5, d: 0.4 });

    return list;
  }, [trees, houses, plots]);

  useEffect(() => {
    onReadyColliders?.(colliders);
  }, [colliders, onReadyColliders]);

  /* ---------- Handlers ---------- */
  const onPlotClick = (plotId: string) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onEnterPlot?.(plotId);
  };
  const onGateClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onEnterSchool?.();
  };
  const onNpcDoorClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    alert("🚪 Locked. This is an NPC home.");
  };

  const groundSizeLocal = groundSize;

  /* ---------- Render ---------- */
  return (
    <group>
      {/* Ground */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[groundSizeLocal, groundSizeLocal]} />
        <primitive object={grassMat} attach="material" />
      </mesh>

      {/* Plaza */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <circleGeometry args={[18, 48]} />
        <primitive object={sidewalkMat} attach="material" />
      </mesh>

      {/* Roads */}
      <Road x={0} z={-groundSizeLocal * 0.25} w={groundSizeLocal * 0.8} d={4} mat={roadMat} />
      <Road x={0} z={groundSizeLocal * 0.25} w={groundSizeLocal * 0.8} d={4} mat={roadMat} />
      <Road x={-groundSizeLocal * 0.25} z={0} w={4} d={groundSizeLocal * 0.8} mat={roadMat} />
      <Road x={groundSizeLocal * 0.25} z={0} w={4} d={groundSizeLocal * 0.8} mat={roadMat} />

      {/* Path to school */}
      <Path x={0} z={-12} w={6} d={20} mat={sidewalkMat} />

      {/* School gate (click to enter) */}
      <group position={[0, 0, -24]}>
        <Gate onClick={onGateClick} />
        <Text position={[0, 2.8, 0.2]} fontSize={0.8} color="#0b1220" anchorX="center" anchorY="middle">
          School Entrance
        </Text>
      </group>

      {/* NPC houses with fenced yards */}
      {houses.map((h) => (
        <HouseWithYard
          key={h.id}
          x={h.x}
          z={h.z}
          w={h.w}
          d={h.d}
          rotY={h.rot}
          wallMat={houseWallMat}
          roofMat={roofMat}
          doorMat={doorMat}
          fenceMat={fenceMat}
          onDoorClick={onNpcDoorClick}
        />
      ))}

      {/* Player plots */}
      {plots.map((p) => {
        const owned = ownedPlots.includes(p.id);
        const mine = myPlotId === p.id;
        return (
          <group key={p.id} position={[p.x, 0, p.z]}>
            <Fence w={14} d={14} mat={fenceMat} gateGap={2} />
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              position={[0, 0.01, 0]}
              receiveShadow
              onClick={onPlotClick(p.id)}
            >
              <planeGeometry args={[12, 12]} />
              <primitive object={mine ? plotMineMat : owned ? plotOwnedMat : plotMat} attach="material" />
            </mesh>
            <Text position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.9} color="#0b1220" anchorX="center">
              {mine ? "Your Plot" : owned ? "Claimed" : "Available Plot"}
            </Text>
          </group>
        );
      })}

      {/* Trees */}
      {trees.map((t, i) => (
        <Tree key={i} x={t.x} z={t.z} />
      ))}

      <Text position={[0, 3.2, 0]} fontSize={1} color="#0b1220" anchorX="center" anchorY="middle">
        Neighborhood
      </Text>
    </group>
  );
}

/* -------------- bits -------------- */

function Road({ x, z, w, d, mat }: { x: number; z: number; w: number; d: number; mat: THREE.Material }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.005, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}
function Path({ x, z, w, d, mat }: { x: number; z: number; w: number; d: number; mat: THREE.Material }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[x, 0.006, z]} receiveShadow>
      <planeGeometry args={[w, d]} />
      <primitive object={mat} attach="material" />
    </mesh>
  );
}

function Fence({ w, d, mat, gateGap = 1.6 }: { w: number; d: number; mat: THREE.Material; gateGap?: number }) {
  const t = 0.12;
  return (
    <group>
      <mesh position={[0, 0.75, -d / 2]}>
        <boxGeometry args={[w, 1.5, t]} />
        <primitive object={mat} attach="material" />
      </mesh>
      <mesh position={[-(w - gateGap) / 4, 0.75, d / 2]}>
        <boxGeometry args={[((w - gateGap) / 2), 1.5, t]} />
        <primitive object={mat} attach="material" />
      </mesh>
      <mesh position={[(w - gateGap) / 4, 0.75, d / 2]}>
        <boxGeometry args={[((w - gateGap) / 2), 1.5, t]} />
        <primitive object={mat} attach="material" />
      </mesh>
      <mesh position={[-w / 2, 0.75, 0]}>
        <boxGeometry args={[t, 1.5, d]} />
        <primitive object={mat} attach="material" />
      </mesh>
      <mesh position={[w / 2, 0.75, 0]}>
        <boxGeometry args={[t, 1.5, d]} />
        <primitive object={mat} attach="material" />
      </mesh>
    </group>
  );
}

function HouseWithYard({
  x,
  z,
  w,
  d,
  rotY,
  wallMat,
  roofMat,
  doorMat,
  fenceMat,
  onDoorClick,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  rotY: number;
  wallMat: THREE.Material;
  roofMat: THREE.Material;
  doorMat: THREE.Material;
  fenceMat: THREE.Material;
  onDoorClick: (e: ThreeEvent<MouseEvent>) => void;
}) {
  return (
    <group position={[x, 0, z]} rotation={[0, rotY, 0]}>
      <mesh position={[0, 1, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, 2, d]} />
        <primitive object={wallMat} attach="material" />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <cylinderGeometry args={[0, Math.max(w, d) * 0.7, 1.2, 4]} />
        <primitive object={roofMat} attach="material" />
      </mesh>
      <mesh position={[0, 0.8, d / 2 + 0.05]} castShadow onClick={onDoorClick}>
        <boxGeometry args={[1, 1.6, 0.1]} />
        <primitive object={doorMat} attach="material" />
      </mesh>

      <group>
        <Fence w={w + 6} d={d + 6} mat={fenceMat} gateGap={1.6} />
      </group>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[w + 5.6, d + 5.6]} />
        <meshStandardMaterial color={"#a9e7a4"} roughness={0.98} />
      </mesh>
    </group>
  );
}

function Tree({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.25, 1.2, 8]} />
        <meshStandardMaterial color="#7a4d2b" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.5, 0]} castShadow>
        <icosahedronGeometry args={[0.9, 0]} />
        <meshStandardMaterial color="#2f855a" roughness={0.9} />
      </mesh>
    </group>
  );
}

function Gate({ onClick }: { onClick?: (e: ThreeEvent<MouseEvent>) => void }) {
  return (
    <group>
      <mesh position={[-3.2, 1.2, 0]} castShadow>
        <boxGeometry args={[0.25, 2.4, 0.25]} />
        <meshStandardMaterial color="#444e5a" roughness={0.8} />
      </mesh>
      <mesh position={[3.2, 1.2, 0]} castShadow>
        <boxGeometry args={[0.25, 2.4, 0.25]} />
        <meshStandardMaterial color="#444e5a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 2.2, 0]} castShadow>
        <boxGeometry args={[6.5, 0.25, 0.25]} />
        <meshStandardMaterial color="#444e5a" roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.1, 0]} onClick={onClick}>
        <boxGeometry args={[6.2, 1.8, 0.1]} />
        <meshStandardMaterial color="#93c5fd" roughness={0.6} />
      </mesh>
    </group>
  );
}
