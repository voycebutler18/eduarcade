import * as THREE from "three";
import { useMemo, useRef } from "react";
import { Text } from "@react-three/drei";
import { ThreeEvent } from "@react-three/fiber";

/**
 * Campus3D
 * - Simple low-poly school layout:
 *   • Main hall with lockers
 *   • 5 rooms: Math, ELA, Science, Social, Lunch
 *   • Clickable doors fire onEnter(classId)
 * - This is scenery only; movement comes in next step.
 */

export type ClassId = "MATH" | "ELA" | "SCI" | "SOC" | "LUNCH";

export default function Campus3D({
  onEnter,
}: {
  onEnter?: (classId: ClassId) => void;
}) {
  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#334155", roughness: 0.9 }),
    []
  );
  const floorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#cfd7df", roughness: 0.95 }),
    []
  );
  const doorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#93c5fd", roughness: 0.6, metalness: 0.1 }),
    []
  );
  const lockerMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#1f2937", roughness: 0.6 }),
    []
  );
  const tableMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#94a3b8", roughness: 0.7 }),
    []
  );

  const clickDoor = (classId: ClassId) => (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onEnter?.(classId);
  };

  // Refs just in case we later animate/open doors
  const doors = {
    MATH: useRef<THREE.Mesh>(null!),
    ELA: useRef<THREE.Mesh>(null!),
    SCI: useRef<THREE.Mesh>(null!),
    SOC: useRef<THREE.Mesh>(null!),
    LUNCH: useRef<THREE.Mesh>(null!),
  };

  return (
    <group>
      {/* Yard / Outside */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={"#dbe7f0"} roughness={0.98} />
      </mesh>

      {/* School floor plate */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
        <planeGeometry args={[36, 24]} />
        {floorMat}
      </mesh>

      {/* Main rectangular shell walls */}
      {/* back wall */}
      <mesh position={[0, 1.75, -12]} castShadow receiveShadow>
        <boxGeometry args={[36, 3.5, 0.4]} />
        {wallMat}
      </mesh>
      {/* front wall */}
      <mesh position={[0, 1.75, 12]} castShadow receiveShadow>
        <boxGeometry args={[36, 3.5, 0.4]} />
        {wallMat}
      </mesh>
      {/* left wall */}
      <mesh position={[-18, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 3.5, 24]} />
        {wallMat}
      </mesh>
      {/* right wall */}
      <mesh position={[18, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 3.5, 24]} />
        {wallMat}
      </mesh>

      {/* Center hallway divider (makes two corridors) */}
      <mesh position={[0, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.4, 3.5, 24]} />
        {wallMat}
      </mesh>

      {/* ----- Rooms (simple boxes) ----- */}
      {/* Coords: X left/right, Z forward/back. Y is height. */}
      {/* Math (top-left) */}
      <Room x={-9} z={-8} w={8.8} d={7.6} wallMat={wallMat} />
      {/* ELA (bottom-left) */}
      <Room x={-9} z={8} w={8.8} d={7.6} wallMat={wallMat} />
      {/* Science (top-right) */}
      <Room x={9} z={-8} w={8.8} d={7.6} wallMat={wallMat} />
      {/* Social (bottom-right) */}
      <Room x={9} z={8} w={8.8} d={7.6} wallMat={wallMat} />
      {/* Lunch (middle-right, front) */}
      <Room x={9} z={0} w={8.8} d={6.5} wallMat={wallMat} />

      {/* ----- Doors (clickable) ----- */}
      <Door ref={doors.MATH} x={-4.6} z={-4.2} onClick={clickDoor("MATH")} mat={doorMat} />
      <Door ref={doors.ELA} x={-4.6} z={4.2} onClick={clickDoor("ELA")} mat={doorMat} />
      <Door ref={doors.SCI} x={4.6} z={-4.2} onClick={clickDoor("SCI")} mat={doorMat} />
      <Door ref={doors.SOC} x={4.6} z={4.2} onClick={clickDoor("SOC")} mat={doorMat} />
      <Door ref={doors.LUNCH} x={4.6} z={0} onClick={clickDoor("LUNCH")} mat={doorMat} />

      {/* ----- Labels above doors ----- */}
      <Label text="Math" x={-4.6} z={-5.1} />
      <Label text="ELA" x={-4.6} z={5.1} />
      <Label text="Science" x={4.6} z={-5.1} />
      <Label text="Social Studies" x={4.6} z={5.1} />
      <Label text="Lunch" x={4.6} z={-0.9} />

      {/* ----- Lockers along the hallway (left side) ----- */}
      <Lockers startX={-16} endX={-2} z={0.2} mat={lockerMat} />
      {/* And right side */}
      <Lockers startX={2} endX={16} z={-0.2} mat={lockerMat} />

      {/* Lunch tables (simple discs) */}
      <Tables cx={9} cz={0} rows={2} cols={2} spacing={2.8} mat={tableMat} />

      {/* Ambient bits */}
      <group position={[0, 0, 0]}>
        <Text position={[0, 2.6, 0]} fontSize={0.55} color="#0b1220" anchorX="center" anchorY="middle">
          Central Hall
        </Text>
      </group>
    </group>
  );
}

/* ------------ Small components ------------ */

function Room({
  x,
  z,
  w,
  d,
  wallMat,
}: {
  x: number;
  z: number;
  w: number;
  d: number;
  wallMat: THREE.Material;
}) {
  return (
    <group position={[x, 0, z]}>
      {/* back wall */}
      <mesh position={[0, 1.75, -d / 2]} castShadow receiveShadow>
        <boxGeometry args={[w, 3.5, 0.2]} />
        {wallMat}
      </mesh>
      {/* front wall (leave gap for door—we won’t put a segment there) */}
      <mesh position={[-(w / 2) + 1.2, 1.75, d / 2]} castShadow receiveShadow>
        <boxGeometry args={[w - 2.4, 3.5, 0.2]} />
        {wallMat}
      </mesh>
      {/* left & right walls */}
      <mesh position={[-w / 2, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 3.5, d]} />
        {wallMat}
      </mesh>
      <mesh position={[w / 2, 1.75, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.2, 3.5, d]} />
        {wallMat}
      </mesh>
    </group>
  );
}

const Door = /* @__PURE__ */ (/* eslint-disable react/display-name */ 
  (props: React.ComponentProps<"mesh"> & { x: number; z: number; mat: THREE.Material }) =>
    <mesh {...props} position={[props.x, 1, props.z]} castShadow receiveShadow>
      <boxGeometry args={[1.2, 2, 0.12]} />
      {props.mat}
    </mesh>
);

function Label({ text, x, z }: { text: string; x: number; z: number }) {
  return (
    <Text position={[x, 2.2, z]} rotation={[0, 0, 0]} fontSize={0.45} color="#0b1220" anchorX="center" anchorY="middle">
      {text}
    </Text>
  );
}

function Lockers({
  startX,
  endX,
  z,
  mat,
}: {
  startX: number;
  endX: number;
  z: number;
  mat: THREE.Material;
}) {
  const step = 1.2;
  const boxes = [];
  for (let x = startX; x <= endX; x += step) {
    boxes.push(
      <mesh key={x} position={[x, 1.2, z]} castShadow>
        <boxGeometry args={[1, 2.2, 0.3]} />
        {mat}
      </mesh>
    );
  }
  return <group>{boxes}</group>;
}

function Tables({
  cx,
  cz,
  rows,
  cols,
  spacing,
  mat,
}: {
  cx: number;
  cz: number;
  rows: number;
  cols: number;
  spacing: number;
  mat: THREE.Material;
}) {
  const list = [];
  const sx = -(cols - 1) * spacing * 0.5;
  const sz = -(rows - 1) * spacing * 0.5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      list.push(
        <mesh key={`${r}-${c}`} position={[cx + sx + c * spacing, 0.8, cz + sz + r * spacing]} castShadow>
          <cylinderGeometry args={[0.8, 0.8, 0.1, 16]} />
          {mat}
        </mesh>
      );
    }
  }
  return <group>{list}</group>;
}
