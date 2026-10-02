"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { STUDIO_DESTINATIONS, type StudioDestination } from "../lib/studio-registry";
import { consumeStudioTravel, markStudioTravel } from "../lib/studio-travel";
import styles from "./StudioDistrictScene.module.css";

type StudioId = StudioDestination["id"];
type QualityTier = "high" | "balanced" | "lite";

const ACCENTS: Readonly<Record<StudioId, number>> = {
  "sport-fit": 0x50e5ca,
  "paint-build": 0xd69a52,
  style: 0xd28fb8,
  color: 0x7fa7e5
};

const DOORS: Readonly<Record<StudioId, Readonly<{ x: number; z: number; side: -1 | 1 }>>> = {
  "sport-fit": { x: -4.7, z: 1.1, side: -1 },
  "paint-build": { x: 4.7, z: 1.1, side: 1 },
  style: { x: -4.7, z: -5.0, side: -1 },
  color: { x: 4.7, z: -5.0, side: 1 }
};

function qualityTier(width: number): QualityTier {
  const cores = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4;
  if (width <= 640 || cores <= 4) return "lite";
  if (width >= 1180 && cores >= 8) return "high";
  return "balanced";
}

function StudioDockLink({
  studio,
  active,
  travelling,
  onNavigate
}: {
  studio: StudioDestination;
  active: boolean;
  travelling: boolean;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>, studio: StudioDestination) => void;
}) {
  return (
    <Link
      href={studio.href}
      className={styles.dockLink}
      data-tone={studio.tone}
      data-active={active || undefined}
      data-travelling={travelling || undefined}
      onClick={(event) => onNavigate(event, studio)}
    >
      <span className={styles.dockDot} aria-hidden="true" />
      <span>
        <small>{studio.eyebrow}</small>
        <strong>{studio.title}</strong>
      </span>
      <b aria-hidden="true">→</b>
    </Link>
  );
}

export function StudioDistrictScene() {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const travelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterRef = useRef<(studioId: StudioId) => void>(() => undefined);
  const focusedIdRef = useRef<StudioId | undefined>(undefined);
  const travellingIdRef = useRef<StudioId | undefined>(undefined);
  const reducedMotionRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [threeAvailable, setThreeAvailable] = useState(true);
  const [simpleMode, setSimpleMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [focusedId, setFocusedId] = useState<StudioId>();
  const [travellingId, setTravellingId] = useState<StudioId>();
  const [tier, setTier] = useState<QualityTier>("balanced");

  focusedIdRef.current = focusedId;
  travellingIdRef.current = travellingId;
  reducedMotionRef.current = reducedMotion;

  const focusedStudio = useMemo(
    () => STUDIO_DESTINATIONS.find((studio) => studio.id === focusedId),
    [focusedId]
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  function enterStudio(studioId: StudioId) {
    const studio = STUDIO_DESTINATIONS.find((item) => item.id === studioId);
    if (!studio) return;
    if (travelTimerRef.current) clearTimeout(travelTimerRef.current);

    markStudioTravel("hub", studio.id);
    setFocusedId(studio.id);

    if (simpleMode || reducedMotion || !threeAvailable) {
      router.push(studio.href);
      return;
    }

    setTravellingId(studio.id);
    travelTimerRef.current = setTimeout(() => router.push(studio.href), 760);
  }

  enterRef.current = enterStudio;

  function handleNavigate(event: ReactMouseEvent<HTMLAnchorElement>, studio: StudioDestination) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    enterStudio(studio.id);
  }

  useEffect(() => {
    const marker = consumeStudioTravel("hub");
    if (marker?.from && marker.from !== "hub") {
      setFocusedId(marker.from);
      if (!reducedMotionRef.current) {
        setTravellingId(marker.from);
        travelTimerRef.current = setTimeout(() => setTravellingId(undefined), 620);
      }
    }
    return () => {
      if (travelTimerRef.current) clearTimeout(travelTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const mount = mountRef.current;
    if (!stage || !mount || simpleMode) {
      setReady(true);
      return;
    }

    let disposed = false;
    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;
    const cleanups: Array<() => void> = [];

    void (async () => {
      try {
        const THREE = await import("three");
        if (disposed) return;

        const nextTier = qualityTier(stage.clientWidth);
        setTier(nextTier);

        const scene = new THREE.Scene();
        scene.background = new THREE.Color(0x171613);
        scene.fog = new THREE.FogExp2(0x171613, nextTier === "lite" ? 0.035 : 0.028);

        const camera = new THREE.PerspectiveCamera(
          stage.clientWidth <= 720 ? 58 : 48,
          stage.clientWidth / Math.max(1, stage.clientHeight),
          0.1,
          80
        );
        camera.position.set(0, stage.clientWidth <= 720 ? 2.35 : 2.55, 10.8);

        const renderer = new THREE.WebGLRenderer({
          antialias: nextTier !== "lite",
          powerPreference: "high-performance",
          alpha: false
        });
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.06;
        renderer.shadowMap.enabled = nextTier !== "lite";
        if (renderer.shadowMap.enabled) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, nextTier === "high" ? 1.65 : nextTier === "balanced" ? 1.35 : 1));
        renderer.domElement.className = styles.threeCanvas;
        renderer.domElement.setAttribute("aria-hidden", "true");
        renderer.domElement.style.touchAction = "pan-y";
        mount.replaceChildren(renderer.domElement);

        const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();

        function canvasTexture(base: string, line: string, tile = 42) {
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 256;
          const ctx = canvas.getContext("2d");
          if (!ctx) return undefined;
          ctx.fillStyle = base;
          ctx.fillRect(0, 0, 256, 256);
          for (let i = 0; i < 1250; i += 1) {
            const alpha = 0.012 + Math.random() * 0.035;
            ctx.fillStyle = `rgba(255,255,255,${alpha})`;
            ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
          }
          ctx.strokeStyle = line;
          ctx.lineWidth = 1;
          for (let x = 0; x <= 256; x += tile) {
            ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, 256); ctx.stroke();
          }
          for (let y = 0; y <= 256; y += tile) {
            ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke();
          }
          const texture = new THREE.CanvasTexture(canvas);
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(4, 9);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = maxAnisotropy;
          return texture;
        }

        function signTexture(title: string, subtitle: string, accent: string) {
          const canvas = document.createElement("canvas");
          canvas.width = 768;
          canvas.height = 220;
          const ctx = canvas.getContext("2d");
          if (!ctx) return undefined;
          ctx.fillStyle = "#121311";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = accent;
          ctx.fillRect(0, 0, 8, canvas.height);
          ctx.fillStyle = "#f4efe7";
          ctx.font = "600 58px Arial";
          ctx.fillText(title, 48, 91);
          ctx.fillStyle = "#9f9b93";
          ctx.font = "700 20px Arial";
          ctx.letterSpacing = "4px";
          ctx.fillText(subtitle, 50, 145);
          ctx.fillStyle = "#6f756f";
          ctx.font = "700 17px Arial";
          ctx.fillText("ENTER  →", 50, 185);
          const texture = new THREE.CanvasTexture(canvas);
          texture.colorSpace = THREE.SRGBColorSpace;
          texture.anisotropy = maxAnisotropy;
          return texture;
        }

        const floorMap = canvasTexture("#4a4339", "rgba(205,194,178,.10)", 48);
        const wallMap = canvasTexture("#2b2a26", "rgba(218,211,199,.04)", 64);

        const floorMaterial = new THREE.MeshStandardMaterial({
          color: 0x665e52,
          map: floorMap,
          roughness: 0.82,
          metalness: 0.05
        });
        const wallMaterial = new THREE.MeshStandardMaterial({
          color: 0x34332f,
          map: wallMap,
          roughness: 0.93,
          metalness: 0.02
        });
        const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x171816, roughness: 0.82, metalness: 0.08 });
        const brassMaterial = new THREE.MeshStandardMaterial({ color: 0x8e7959, roughness: 0.42, metalness: 0.62 });

        const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 28), floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.set(0, 0, -2.5);
        floor.receiveShadow = true;
        scene.add(floor);

        const runner = new THREE.Mesh(
          new THREE.PlaneGeometry(2.8, 24),
          new THREE.MeshStandardMaterial({ color: 0x24231f, roughness: 0.72, metalness: 0.04 })
        );
        runner.rotation.x = -Math.PI / 2;
        runner.position.set(0, 0.012, -3.0);
        runner.receiveShadow = true;
        scene.add(runner);

        const leftWall = new THREE.Mesh(new THREE.BoxGeometry(0.34, 5.8, 24), wallMaterial);
        leftWall.position.set(-5.15, 2.9, -2.5);
        leftWall.receiveShadow = true;
        scene.add(leftWall);

        const rightWall = leftWall.clone();
        rightWall.position.x = 5.15;
        scene.add(rightWall);

        const farWall = new THREE.Mesh(new THREE.BoxGeometry(10.6, 5.8, 0.36), wallMaterial);
        farWall.position.set(0, 2.9, -14.3);
        farWall.receiveShadow = true;
        scene.add(farWall);

        const ceiling = new THREE.Mesh(
          new THREE.PlaneGeometry(10.3, 25),
          new THREE.MeshStandardMaterial({ color: 0x23231f, roughness: 0.95, side: THREE.DoubleSide })
        );
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.set(0, 5.75, -2.8);
        scene.add(ceiling);

        for (let z = 6; z >= -13; z -= 3.8) {
          const beam = new THREE.Mesh(new THREE.BoxGeometry(10.1, 0.14, 0.18), brassMaterial);
          beam.position.set(0, 5.42, z);
          scene.add(beam);

          const strip = new THREE.Mesh(
            new THREE.BoxGeometry(5.0, 0.035, 0.08),
            new THREE.MeshBasicMaterial({ color: 0xd9d1c2 })
          );
          strip.position.set(0, 5.31, z);
          scene.add(strip);
        }

        const hemi = new THREE.HemisphereLight(0xf1e7d7, 0x211f1b, 1.25);
        scene.add(hemi);

        const key = new THREE.DirectionalLight(0xfff0dc, 1.2);
        key.position.set(3.5, 6.8, 7.5);
        key.castShadow = renderer.shadowMap.enabled;
        if (key.castShadow) {
          key.shadow.mapSize.set(nextTier === "high" ? 2048 : 1024, nextTier === "high" ? 2048 : 1024);
          key.shadow.camera.near = 0.5;
          key.shadow.camera.far = 30;
        }
        scene.add(key);

        const hitMeshes: any[] = [];
        const studioGroups = new Map<StudioId, any>();

        function addBox(group: any, size: readonly [number, number, number], position: readonly [number, number, number], material: any, cast = true) {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(size[0], size[1], size[2]), material);
          mesh.position.set(position[0], position[1], position[2]);
          mesh.castShadow = cast && renderer.shadowMap.enabled;
          mesh.receiveShadow = true;
          group.add(mesh);
          return mesh;
        }

        function addCylinder(group: any, radius: number, height: number, position: readonly [number, number, number], material: any, rotationZ = 0) {
          const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 20), material);
          mesh.position.set(position[0], position[1], position[2]);
          mesh.rotation.z = rotationZ;
          mesh.castShadow = renderer.shadowMap.enabled;
          group.add(mesh);
          return mesh;
        }

        function createDoor(studio: StudioDestination) {
          const cfg = DOORS[studio.id];
          const accent = ACCENTS[studio.id];
          const accentColor = new THREE.Color(accent);
          const group = new THREE.Group();
          group.position.set(cfg.x, 1.55, cfg.z);
          group.rotation.y = cfg.side < 0 ? Math.PI / 2 : -Math.PI / 2;

          const frameMaterial = new THREE.MeshStandardMaterial({
            color: 0x423d35,
            roughness: 0.48,
            metalness: 0.55
          });
          const accentMaterial = new THREE.MeshStandardMaterial({
            color: accent,
            emissive: accent,
            emissiveIntensity: 0.38,
            roughness: 0.38,
            metalness: 0.42
          });
          const recessMaterial = new THREE.MeshStandardMaterial({
            color: 0x111210,
            roughness: 0.88,
            metalness: 0.06
          });

          addBox(group, [0.18, 3.45, 0.35], [-1.35, 0, 0], frameMaterial);
          addBox(group, [0.18, 3.45, 0.35], [1.35, 0, 0], frameMaterial);
          addBox(group, [2.88, 0.18, 0.35], [0, 1.64, 0], frameMaterial);
          addBox(group, [2.72, 0.08, 0.34], [0, -1.69, 0], brassMaterial);
          addBox(group, [2.56, 3.15, 0.18], [0, -0.02, -0.25], recessMaterial, false);

          const sign = signTexture(studio.title, studio.eyebrow, `#${accent.toString(16).padStart(6, "0")}`);
          if (sign) {
            const signMesh = new THREE.Mesh(
              new THREE.PlaneGeometry(2.72, 0.78),
              new THREE.MeshBasicMaterial({ map: sign, transparent: false })
            );
            signMesh.position.set(0, 2.28, 0.04);
            group.add(signMesh);
          }

          const light = new THREE.PointLight(accent, nextTier === "lite" ? 4.5 : 7.0, 4.5, 2);
          light.position.set(0, 0.4, 1.1);
          group.add(light);

          if (studio.id === "sport-fit") {
            const torus = new THREE.Mesh(
              new THREE.TorusGeometry(0.82, 0.035, 12, 64),
              accentMaterial
            );
            torus.position.set(0, 0.18, -0.08);
            group.add(torus);

            const sphereGeometry = new THREE.SphereGeometry(0.10, 16, 12);
            const points = [
              [-0.72, 0.7, 0.04], [-0.40, -0.58, 0.06], [0.15, 0.58, 0.0],
              [0.68, -0.24, 0.02], [0.58, 0.82, -0.02], [-0.08, -0.10, 0.04]
            ];
            points.forEach(([x, y, z]) => {
              const sphere = new THREE.Mesh(sphereGeometry, accentMaterial);
              sphere.position.set(x, y, z);
              sphere.castShadow = renderer.shadowMap.enabled;
              group.add(sphere);
            });
          }

          if (studio.id === "paint-build") {
            const tileColors = [0xd7c2a2, 0x88715e, 0xc79a62, 0x5e665e, 0xb9a890, 0x846c52];
            tileColors.forEach((color, index) => {
              const tile = addBox(
                group,
                [0.58, 0.45, 0.10],
                [-0.72 + (index % 3) * 0.72, 0.75 - Math.floor(index / 3) * 0.62, 0.0],
                new THREE.MeshStandardMaterial({ color, roughness: 0.72, metalness: 0.02 }),
                false
              );
              tile.receiveShadow = true;
            });
            const canMaterial = new THREE.MeshStandardMaterial({ color: 0xd6d0c5, roughness: 0.38, metalness: 0.68 });
            addCylinder(group, 0.26, 0.56, [-0.62, -1.03, 0.25], canMaterial);
            const roller = addCylinder(group, 0.055, 1.0, [0.55, -0.75, 0.18], brassMaterial, Math.PI / 3);
            roller.rotation.x = Math.PI / 2;
            addBox(group, [0.78, 0.15, 0.18], [0.87, -0.34, 0.19], accentMaterial);
          }

          if (studio.id === "style") {
            const mirror = new THREE.Mesh(
              new THREE.PlaneGeometry(0.95, 1.9),
              new THREE.MeshStandardMaterial({ color: 0x9ba0a1, roughness: 0.12, metalness: 0.9 })
            );
            mirror.position.set(0, 0.45, -0.12);
            group.add(mirror);

            const skin = new THREE.MeshStandardMaterial({ color: 0xc8aa91, roughness: 0.78 });
            const cloth = new THREE.MeshStandardMaterial({ color: 0x2d2c2a, roughness: 0.58 });
            const head = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 14), skin);
            head.position.set(0, 0.86, 0.18);
            group.add(head);
            addCylinder(group, 0.25, 0.82, [0, 0.28, 0.18], cloth);
            addCylinder(group, 0.07, 0.78, [-0.28, 0.28, 0.18], skin, 0.10);
            addCylinder(group, 0.07, 0.78, [0.28, 0.28, 0.18], skin, -0.10);
            addCylinder(group, 0.08, 0.86, [-0.13, -0.58, 0.18], cloth, 0.03);
            addCylinder(group, 0.08, 0.86, [0.13, -0.58, 0.18], cloth, -0.03);

            addCylinder(group, 0.025, 1.8, [-0.92, 0.15, 0.18], brassMaterial);
            addCylinder(group, 0.025, 1.8, [0.92, 0.15, 0.18], brassMaterial);
            const rail = addCylinder(group, 0.025, 1.84, [0, 0.95, 0.18], brassMaterial, Math.PI / 2);
            rail.rotation.x = Math.PI / 2;
          }

          if (studio.id === "color") {
            const swatches = [0xa94f66, 0x587caf, 0xc29b53, 0x628f77, 0x8f697f, 0xb67955, 0x4f887f, 0x8567a1, 0xb68d9e, 0x53718e, 0xc2b26a, 0x7a9b69];
            swatches.forEach((color, index) => {
              addBox(
                group,
                [0.48, 0.36, 0.08],
                [-0.82 + (index % 4) * 0.55, 0.92 - Math.floor(index / 4) * 0.50, 0.0],
                new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.02 }),
                false
              );
            });
            addBox(group, [1.72, 0.12, 0.78], [0, -1.12, 0.24], brassMaterial);
            addBox(group, [0.62, 0.48, 0.07], [0, -0.72, 0.38], accentMaterial, false);
          }

          const hit = new THREE.Mesh(
            new THREE.BoxGeometry(2.9, 3.55, 0.85),
            new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
          );
          hit.position.set(0, 0, 0.18);
          hit.userData.studioId = studio.id;
          group.add(hit);
          hitMeshes.push(hit);

          scene.add(group);
          studioGroups.set(studio.id, group);
        }

        STUDIO_DESTINATIONS.forEach(createDoor);

        const directory = new THREE.Group();
        directory.position.set(0, 1.25, -10.8);
        addBox(directory, [4.6, 2.4, 0.16], [0, 0, 0], darkMaterial, false);
        const directoryTexture = signTexture("KONTA MOY STUDIOS", "CHOOSE A SPACE · ENTER · DISCOVER", "#9fb9af");
        if (directoryTexture) {
          const display = new THREE.Mesh(
            new THREE.PlaneGeometry(4.25, 1.38),
            new THREE.MeshBasicMaterial({ map: directoryTexture })
          );
          display.position.z = 0.10;
          directory.add(display);
        }
        scene.add(directory);

        const raycaster = new THREE.Raycaster();
        const pointer = new THREE.Vector2();
        const pointerStart = { x: 0, y: 0 };
        let pointerMoved = false;
        let pointerTargetX = 0;
        let pointerTargetY = 0;

        function pointerCoords(event: PointerEvent) {
          const rect = renderer.domElement.getBoundingClientRect();
          pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
          pointer.y = -((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
        }

        const onPointerDown = (event: PointerEvent) => {
          pointerStart.x = event.clientX;
          pointerStart.y = event.clientY;
          pointerMoved = false;
        };

        const onPointerMove = (event: PointerEvent) => {
          const dx = event.clientX - pointerStart.x;
          const dy = event.clientY - pointerStart.y;
          if (Math.hypot(dx, dy) > 8) pointerMoved = true;

          if (event.pointerType === "mouse") {
            const rect = renderer.domElement.getBoundingClientRect();
            pointerTargetX = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 0.34;
            pointerTargetY = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 0.10;
            pointerCoords(event);
            raycaster.setFromCamera(pointer, camera);
            const hit = raycaster.intersectObjects(hitMeshes, false)[0];
            const id = hit?.object?.userData?.studioId as StudioId | undefined;
            renderer.domElement.style.cursor = id ? "pointer" : "default";
            if (id) setFocusedId(id);
          }
        };

        const onPointerUp = (event: PointerEvent) => {
          if (pointerMoved) return;
          pointerCoords(event);
          raycaster.setFromCamera(pointer, camera);
          const hit = raycaster.intersectObjects(hitMeshes, false)[0];
          const id = hit?.object?.userData?.studioId as StudioId | undefined;
          if (id) enterRef.current(id);
        };

        renderer.domElement.addEventListener("pointerdown", onPointerDown);
        renderer.domElement.addEventListener("pointermove", onPointerMove);
        renderer.domElement.addEventListener("pointerup", onPointerUp);
        cleanups.push(() => {
          renderer.domElement.removeEventListener("pointerdown", onPointerDown);
          renderer.domElement.removeEventListener("pointermove", onPointerMove);
          renderer.domElement.removeEventListener("pointerup", onPointerUp);
        });

        const defaultTarget = new THREE.Vector3(0, 1.45, -3.6);
        const desiredPosition = new THREE.Vector3();
        const desiredTarget = new THREE.Vector3();
        const currentTarget = defaultTarget.clone();

        function targetForStudio(id: StudioId) {
          const cfg = DOORS[id];
          return new THREE.Vector3(cfg.x * 0.82, 1.5, cfg.z);
        }

        function cameraPositionForStudio(id: StudioId) {
          const cfg = DOORS[id];
          return new THREE.Vector3(cfg.x * 0.34, 2.15, cfg.z + 3.2);
        }

        const resize = () => {
          const width = stage.clientWidth;
          const height = stage.clientHeight;
          const nextMobile = width <= 720;
          camera.aspect = width / Math.max(1, height);
          camera.fov = nextMobile ? 58 : 48;
          camera.updateProjectionMatrix();
          renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, nextTier === "high" ? 1.65 : nextTier === "balanced" ? 1.35 : 1));
          renderer.setSize(width, height, false);
        };
        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(stage);
        resize();

        const clock = new THREE.Clock();

        const render = () => {
          if (disposed) return;
          const elapsed = clock.getElapsedTime();
          const activeTravel = travellingIdRef.current;
          const activeFocus = focusedIdRef.current;

          if (activeTravel) {
            desiredPosition.copy(cameraPositionForStudio(activeTravel));
            desiredTarget.copy(targetForStudio(activeTravel));
          } else {
            desiredPosition.set(
              pointerTargetX * (stage.clientWidth <= 720 ? 0.25 : 1.0),
              (stage.clientWidth <= 720 ? 2.35 : 2.55) - pointerTargetY,
              10.8
            );
            desiredTarget.copy(activeFocus ? targetForStudio(activeFocus) : defaultTarget);
          }

          const ease = reducedMotionRef.current ? 1 : activeTravel ? 0.075 : 0.035;
          camera.position.lerp(desiredPosition, ease);
          currentTarget.lerp(desiredTarget, reducedMotionRef.current ? 1 : 0.05);
          camera.lookAt(currentTarget);

          const sport = studioGroups.get("sport-fit");
          if (sport && !reducedMotionRef.current) {
            const torus = sport.children.find((child: any) => child.geometry?.type === "TorusGeometry");
            if (torus) torus.rotation.z = elapsed * 0.18;
          }

          renderer.render(scene, camera);
          frame = window.requestAnimationFrame(render);
        };

        setThreeAvailable(true);
        setReady(true);
        frame = window.requestAnimationFrame(render);

        cleanups.push(() => {
          resizeObserver?.disconnect();
          window.cancelAnimationFrame(frame);
          scene.traverse((object: any) => {
            object.geometry?.dispose?.();
            const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
            materials.forEach((material: any) => {
              material.map?.dispose?.();
              material.dispose?.();
            });
          });
          floorMap?.dispose?.();
          wallMap?.dispose?.();
          renderer.dispose();
          mount.replaceChildren();
        });
      } catch (error) {
        console.error("[studios] Three.js district unavailable", error);
        setThreeAvailable(false);
        setReady(true);
      }
    })();

    return () => {
      disposed = true;
      cleanups.reverse().forEach((cleanup) => cleanup());
    };
  }, [simpleMode]);

  const staticPresentation = simpleMode || !threeAvailable;

  return (
    <section
      ref={stageRef}
      className={`${styles.stage} ${ready ? styles.ready : ""} ${staticPresentation ? styles.staticMode : ""}`}
      data-travelling={travellingId || undefined}
      aria-labelledby="studios-title"
    >
      <div ref={mountRef} className={styles.threeMount} aria-hidden="true" />

      <div className={styles.topBar}>
        <Link href="/" className={styles.homeLink}>← ΚΟΝΤΑ ΜΟΥ</Link>
        <div className={styles.wordmark}>
          <strong>STUDIOS</strong>
          <span>by KONTA MOY</span>
        </div>
        <button
          type="button"
          className={styles.modeButton}
          aria-pressed={simpleMode}
          onClick={() => {
            setSimpleMode((current) => !current);
            setTravellingId(undefined);
          }}
        >
          {simpleMode ? "3D χώρος" : "Λίστα"}
        </button>
      </div>

      <header className={styles.heroCopy}>
        <span>KONTA MOY · STUDIO DISTRICT</span>
        <h1 id="studios-title">Διάλεξε χώρο.<br /><em>Μπες μέσα.</em></h1>
        <p>Τέσσερα διαφορετικά εργαλεία, τέσσερις διαφορετικοί χώροι. Tap στην πραγματική 3D είσοδο ή διάλεξε από τον οδηγό.</p>
      </header>

      {staticPresentation ? (
        <nav className={styles.fallbackGrid} aria-label="KONTA MOY Studios">
          {STUDIO_DESTINATIONS.map((studio) => (
            <Link key={studio.id} href={studio.href} className={styles.fallbackCard} data-tone={studio.tone}>
              <small>{studio.eyebrow}</small>
              <strong>{studio.title}</strong>
              <span>{studio.description}</span>
              <b>ENTER →</b>
            </Link>
          ))}
        </nav>
      ) : (
        <>
          <div className={styles.sceneHint}>
            <span>REAL-TIME 3D · {tier.toUpperCase()}</span>
            <b>{focusedStudio ? focusedStudio.title : "Tap μία φωτισμένη είσοδο"}</b>
          </div>

          <nav className={styles.studioDock} aria-label="KONTA MOY Studios">
            {STUDIO_DESTINATIONS.map((studio) => (
              <StudioDockLink
                key={studio.id}
                studio={studio}
                active={focusedId === studio.id}
                travelling={travellingId === studio.id}
                onNavigate={handleNavigate}
              />
            ))}
          </nav>
        </>
      )}

      <p className={styles.srStatus} aria-live="polite">
        {travellingId ? `Μετάβαση στο ${STUDIO_DESTINATIONS.find((studio) => studio.id === travellingId)?.title ?? "Studio"}` : ""}
      </p>
    </section>
  );
}
