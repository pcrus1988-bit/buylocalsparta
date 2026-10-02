"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { STUDIO_DESTINATIONS, type StudioDestination } from "../lib/studio-registry";
import { consumeStudioTravel, markStudioTravel } from "../lib/studio-travel";
import { createStudioProgram, resizeStudioCanvas, studioDprCap, type StudioQualityTier } from "../lib/studio-webgl";
import styles from "./StudioDistrictScene.module.css";

type QualityTier = StudioQualityTier;
type Vec3 = readonly [number, number, number];

type Projection = Readonly<{
  x: number;
  y: number;
  depth: number;
  visible: boolean;
}>;

const VERTEX_SHADER = `
precision highp float;
attribute vec3 a_position;
attribute float a_kind;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
varying float v_kind;
varying float v_depth;

void main() {
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  float cx = cos(u_pitch);
  float sx = sin(u_pitch);

  vec3 p = a_position;
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);

  float depth = max(1.4, u_camera - p.z);
  float f = 1.78;
  gl_Position = vec4(
    (p.x * f / max(u_aspect, 0.58)) / depth,
    (p.y * f) / depth,
    clamp((depth - 1.0) / 30.0 * 2.0 - 1.0, -1.0, 1.0),
    1.0
  );

  v_kind = a_kind;
  v_depth = depth;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
varying float v_kind;
varying float v_depth;

vec3 districtColor(float kind) {
  if (kind < 0.5) return vec3(0.30, 0.36, 0.34);
  if (kind < 1.5) return vec3(0.34, 0.86, 0.77);
  if (kind < 2.5) return vec3(0.83, 0.61, 0.34);
  if (kind < 3.5) return vec3(0.78, 0.53, 0.68);
  return vec3(0.50, 0.65, 0.84);
}

void main() {
  vec3 color = districtColor(v_kind);
  float alpha = v_kind < 0.5
    ? clamp(0.36 - v_depth * 0.012, 0.10, 0.26)
    : clamp(0.76 - v_depth * 0.018, 0.34, 0.74);
  gl_FragColor = vec4(color, alpha);
}
`;

function seeded(index: number, salt: number): number {
  let value = Math.imul(index + 17, 1103515245) + Math.imul(salt + 31, 12345);
  value ^= value >>> 13;
  value = Math.imul(value, 1274126177);
  return (value >>> 0) / 4294967295;
}

function districtPosition(studio: StudioDestination, compact: boolean): Vec3 {
  const desktop: Readonly<Record<StudioDestination["id"], Vec3>> = {
    "sport-fit": [-4.2, -0.65, -0.7],
    "paint-build": [4.2, -0.65, -0.7],
    "style": [-4.2, -0.65, -4.1],
    "color": [4.2, -0.65, -4.1]
  };
  const mobile: Readonly<Record<StudioDestination["id"], Vec3>> = {
    "sport-fit": [-2.6, -0.55, -1.0],
    "paint-build": [2.6, -0.55, -1.0],
    "style": [-2.6, -0.55, -3.8],
    "color": [2.6, -0.55, -3.8]
  };
  return (compact ? mobile : desktop)[studio.id];
}

function createSceneData(tier: QualityTier, compact: boolean): Float32Array {
  const data: number[] = [];
  const vertex = (p: Vec3, kind: number) => data.push(p[0], p[1], p[2], kind);
  const line = (a: Vec3, b: Vec3, kind: number) => {
    vertex(a, kind);
    vertex(b, kind);
  };
  const rect = (cx: number, cy: number, z: number, w: number, h: number, kind: number) => {
    const x1 = cx - w / 2;
    const x2 = cx + w / 2;
    const y1 = cy - h / 2;
    const y2 = cy + h / 2;
    line([x1,y1,z],[x2,y1,z],kind);
    line([x2,y1,z],[x2,y2,z],kind);
    line([x2,y2,z],[x1,y2,z],kind);
    line([x1,y2,z],[x1,y1,z],kind);
  };

  // Architectural concourse floor and ceiling perspective lines.
  const gridStep = tier === "lite" ? 2.4 : tier === "balanced" ? 1.8 : 1.4;
  for (let x = -10; x <= 10; x += gridStep) {
    line([x,-3.25,-8],[x,-3.25,7],0);
  }
  for (let z = -8; z <= 7; z += gridStep) {
    line([-10,-3.25,z],[10,-3.25,z],0);
  }

  // Side walls / structural frames make the hub read as an interior district.
  line([-8.8,-3.25,-6.5],[-8.8,4.6,-6.5],0);
  line([8.8,-3.25,-6.5],[8.8,4.6,-6.5],0);
  line([-8.8,4.6,-6.5],[8.8,4.6,-6.5],0);
  line([-8.8,-3.25,4.5],[-8.8,4.6,-6.5],0);
  line([8.8,-3.25,4.5],[8.8,4.6,-6.5],0);

  STUDIO_DESTINATIONS.forEach((studio, studioIndex) => {
    const [px, py, pz] = districtPosition(studio, compact);
    const kind = studioIndex + 1;

    // Every destination is a grounded architectural doorway first.
    rect(px,py,pz,2.1,2.55,kind);
    line([px-1.05,py-1.28,pz],[px-1.45,py-1.58,pz+.55],kind);
    line([px+1.05,py-1.28,pz],[px+1.45,py-1.58,pz+.55],kind);

    if (studio.id === "sport-fit") {
      // A circular product-field preview exists INSIDE the Sport doorway only.
      const segments = tier === "lite" ? 16 : 26;
      for (let i=0;i<segments;i+=1) {
        const a=(i/segments)*Math.PI*2;
        const b=((i+1)/segments)*Math.PI*2;
        const r=.62;
        line(
          [px+Math.cos(a)*r,py+Math.sin(a)*r,pz+.03],
          [px+Math.cos(b)*r,py+Math.sin(b)*r,pz+.03],
          kind
        );
      }
      return;
    }

    if (studio.id === "paint-build") {
      // Wall / tile / material bay.
      for(let row=0;row<3;row+=1){
        for(let col=0;col<3;col+=1){
          rect(px+(col-1)*.48,py+(row-1)*.48,pz+.04,.38,.38,kind);
        }
      }
      line([px-.78,py-.95,pz+.08],[px+.78,py-.95,pz+.08],kind);
      return;
    }

    if (studio.id === "style") {
      // Mirror, mannequin axis and runway perspective.
      rect(px,py+.15,pz+.04,.82,1.55,kind);
      line([px,py+.86,pz+.07],[px,py-.64,pz+.07],kind);
      line([px-.34,py+.32,pz+.07],[px+.34,py+.32,pz+.07],kind);
      line([px-.30,py-.48,pz+.07],[px-.62,py-1.15,pz+.48],kind);
      line([px+.30,py-.48,pz+.07],[px+.62,py-1.15,pz+.48],kind);
      return;
    }

    // Color Finder: physical swatch wall / sample board.
    for(let row=0;row<3;row+=1){
      for(let col=0;col<4;col+=1){
        rect(px+(col-1.5)*.36,py+(row-1)*.42,pz+.04,.27,.31,kind);
      }
    }
  });

  return new Float32Array(data);
}

function rotate(point: Vec3, yaw: number, pitch: number): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const [x, y, z] = point;
  const x1 = cy * x + sy * z;
  const z1 = -sy * x + cy * z;
  return [x1, cx * y - sx * z1, sx * y + cx * z1];
}

function project(point: Vec3, yaw: number, pitch: number, camera: number, width: number, height: number): Projection {
  const [x, y, z] = rotate(point, yaw, pitch);
  const depth = camera - z;
  if (!width || !height || depth <= 1.45) return { x: width / 2, y: height / 2, depth, visible: false };
  const aspect = width / height;
  const f = 1.78;
  const ndcX = (x * f / Math.max(aspect, 0.58)) / depth;
  const ndcY = (y * f) / depth;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth,
    visible: Math.abs(ndcX) < 1.25 && Math.abs(ndcY) < 1.25
  };
}

function qualityTier(width: number): QualityTier {
  const cores = navigator.hardwareConcurrency || 4;
  if (width <= 640 || cores <= 4) return "lite";
  if (width >= 1180 && cores >= 8) return "high";
  return "balanced";
}

function StudioPortal({
  studio,
  index,
  portalRef,
  focused,
  travelling,
  onFocusChange,
  onNavigate
}: {
  studio: StudioDestination;
  index: number;
  portalRef: (node: HTMLAnchorElement | null) => void;
  focused: boolean;
  travelling: boolean;
  onFocusChange: (id?: StudioDestination["id"]) => void;
  onNavigate: (event: ReactMouseEvent<HTMLAnchorElement>, studio: StudioDestination) => void;
}) {
  return (
    <Link
      ref={portalRef}
      href={studio.href}
      className={styles.portal}
      data-tone={studio.tone}
      data-focused={focused || undefined}
      data-travelling={travelling || undefined}
      onMouseEnter={() => onFocusChange(studio.id)}
      onMouseLeave={() => onFocusChange(undefined)}
      onFocus={() => onFocusChange(studio.id)}
      onBlur={() => onFocusChange(undefined)}
      onClick={(event) => onNavigate(event, studio)}
      style={{ "--studio-order": index } as CSSProperties}
    >
      <span className={styles.portalIndex}>{String(index + 1).padStart(2, "0")}</span>
      <span className={styles.portalPreview} data-kind={studio.id} aria-hidden="true">
        <i /><i /><i /><i /><i /><i />
      </span>
      <span className={styles.portalEyebrow}>{studio.eyebrow}</span>
      <strong>{studio.title}</strong>
      <small>{studio.description}</small>
      <b>ENTER <span aria-hidden="true">→</span></b>
    </Link>
  );
}

export function StudioDistrictScene() {
  const router = useRouter();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const portalRefs = useRef(new Map<string, HTMLAnchorElement>());
  const animationRef = useRef<number | null>(null);
  const navigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const returnTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const yawRef = useRef(0.08);
  const pitchRef = useRef(-0.035);
  const targetYawRef = useRef(0.08);
  const targetPitchRef = useRef(-0.035);
  const cameraRef = useRef(10.8);
  const focusedIdRef = useRef<StudioDestination["id"] | undefined>(undefined);
  const travellingIdRef = useRef<StudioDestination["id"] | undefined>(undefined);
  const focusedIndexRef = useRef(-1);
  const reducedMotionRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [webglAvailable, setWebglAvailable] = useState(true);
  const [simpleMode, setSimpleMode] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [focusedId, setFocusedId] = useState<StudioDestination["id"]>();
  const [travellingId, setTravellingId] = useState<StudioDestination["id"]>();
  const [tier, setTier] = useState<QualityTier>("balanced");

  const focusedIndex = useMemo(
    () => STUDIO_DESTINATIONS.findIndex((studio) => studio.id === focusedId),
    [focusedId]
  );

  focusedIdRef.current = focusedId;
  travellingIdRef.current = travellingId;
  focusedIndexRef.current = focusedIndex;
  reducedMotionRef.current = reducedMotion;

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas || simpleMode) {
      setReady(true);
      return;
    }

    const compact = stage.clientWidth <= 720;
    const nextTier = qualityTier(stage.clientWidth);
    setTier(nextTier);

    const gl = canvas.getContext("webgl", {
      alpha: false,
      antialias: nextTier !== "lite",
      depth: false,
      powerPreference: "high-performance",
      preserveDrawingBuffer: false
    });

    if (!gl) {
      setWebglAvailable(false);
      setReady(true);
      return;
    }

    let disposed = false;
    let program: WebGLProgram | null = null;
    let buffer: WebGLBuffer | null = null;
    let resizeObserver: ResizeObserver | null = null;

    try {
      const activeProgram = createStudioProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, "studio_district");
      program = activeProgram;
      buffer = gl.createBuffer();
      if (!buffer) throw new Error("studio_buffer_create_failed");

      const sceneData = createSceneData(nextTier, compact);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, sceneData, gl.STATIC_DRAW);
      gl.useProgram(activeProgram);

      const stride = 4 * Float32Array.BYTES_PER_ELEMENT;
      const positionLocation = gl.getAttribLocation(activeProgram, "a_position");
      const kindLocation = gl.getAttribLocation(activeProgram, "a_kind");
      gl.enableVertexAttribArray(positionLocation);
      gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, stride, 0);
      gl.enableVertexAttribArray(kindLocation);
      gl.vertexAttribPointer(kindLocation, 1, gl.FLOAT, false, stride, 3 * Float32Array.BYTES_PER_ELEMENT);

      const yawLocation = gl.getUniformLocation(activeProgram, "u_yaw");
      const pitchLocation = gl.getUniformLocation(activeProgram, "u_pitch");
      const cameraLocation = gl.getUniformLocation(activeProgram, "u_camera");
      const aspectLocation = gl.getUniformLocation(activeProgram, "u_aspect");

      const dprCap = studioDprCap(nextTier, { high: 1.8, balanced: 1.5, lite: 1.15 });
      const resize = () => { resizeStudioCanvas(canvas, stage, gl, dprCap); };

      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(stage);
      resize();

      const render = (time: number) => {
        if (disposed) return;
        if (!document.hidden) {
          const width = stage.clientWidth;
          const height = stage.clientHeight;

          const activeTravellingId = travellingIdRef.current;
          const activeFocusedId = focusedIdRef.current;
          const destination = activeTravellingId
            ? STUDIO_DESTINATIONS.find((studio) => studio.id === activeTravellingId)
            : activeFocusedId
              ? STUDIO_DESTINATIONS.find((studio) => studio.id === activeFocusedId)
              : undefined;

          if (destination && !reducedMotionRef.current) {
            const [dx, dy] = districtPosition(destination, width <= 720);
            targetYawRef.current += ((dx > 0 ? -0.12 : 0.12) - targetYawRef.current) * 0.035;
            targetPitchRef.current += ((dy > 0 ? 0.055 : -0.055) - targetPitchRef.current) * 0.03;
          }

          yawRef.current += (targetYawRef.current - yawRef.current) * (reducedMotionRef.current ? 1 : 0.055);
          pitchRef.current += (targetPitchRef.current - pitchRef.current) * (reducedMotionRef.current ? 1 : 0.055);
          const targetCamera = activeTravellingId ? 8.2 : 10.8;
          cameraRef.current += (targetCamera - cameraRef.current) * (reducedMotionRef.current ? 1 : 0.07);

          gl.clearColor(0.014, 0.027, 0.025, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          gl.useProgram(activeProgram);
          gl.uniform1f(yawLocation, yawRef.current);
          gl.uniform1f(pitchLocation, pitchRef.current);
          gl.uniform1f(cameraLocation, cameraRef.current);
          gl.uniform1f(aspectLocation, width / Math.max(1, height));
          gl.drawArrays(gl.LINES, 0, sceneData.length / 4);

          const compactPortals = width <= 720;
          const compactLayout: Readonly<Record<StudioDestination["id"], readonly [number, number]>> = {
            "sport-fit": [27, 46],
            "paint-build": [73, 46],
            "style": [27, 69],
            "color": [73, 69]
          };

          STUDIO_DESTINATIONS.forEach((studio) => {
            const node = portalRefs.current.get(studio.id);
            if (!node) return;

            if (compactPortals) {
              const [xPercent, yPercent] = compactLayout[studio.id];
              node.style.setProperty("--portal-x", `${xPercent}%`);
              node.style.setProperty("--portal-y", `${yPercent}%`);
              node.style.setProperty("--portal-scale", "1");
              node.style.setProperty("--portal-opacity", "1");
              return;
            }

            const projection = project(
              districtPosition(studio, false),
              yawRef.current,
              pitchRef.current,
              cameraRef.current,
              width,
              height
            );
            const scale = Math.max(0.74, Math.min(1.08, 10.2 / Math.max(7.5, projection.depth)));
            node.style.setProperty("--portal-x", `${projection.x}px`);
            node.style.setProperty("--portal-y", `${projection.y}px`);
            node.style.setProperty("--portal-scale", scale.toFixed(3));
            node.style.setProperty("--portal-opacity", projection.visible ? "1" : "0");
          });
        }

        animationRef.current = window.requestAnimationFrame(render);
      };

      setWebglAvailable(true);
      setReady(true);
      animationRef.current = window.requestAnimationFrame(render);
    } catch (error) {
      console.error("[studios] WebGL hub unavailable", error);
      setWebglAvailable(false);
      setReady(true);
    }

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      if (animationRef.current !== null) window.cancelAnimationFrame(animationRef.current);
      if (buffer) gl.deleteBuffer(buffer);
      if (program) gl.deleteProgram(program);
    };
  }, [simpleMode]);

  useEffect(() => {
    const marker = consumeStudioTravel("hub");
    if (marker?.from && marker.from !== "hub") {
      const studio = STUDIO_DESTINATIONS.find((item) => item.id === marker.from);
      if (studio) {
        setFocusedId(studio.id);
        setTravellingId(studio.id);
        cameraRef.current = 8.35;
        const [dx, dy] = districtPosition(studio, window.innerWidth <= 720);
        targetYawRef.current = dx > 0 ? -0.12 : 0.12;
        targetPitchRef.current = dy > 0 ? 0.055 : -0.055;
        returnTimerRef.current = setTimeout(() => {
          setTravellingId(undefined);
          setFocusedId(undefined);
        }, 620);
      }
    }
    return () => {
      if (navigationTimerRef.current) clearTimeout(navigationTimerRef.current);
      if (returnTimerRef.current) clearTimeout(returnTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (focusedId || travellingId) return;
    targetYawRef.current = 0.08;
    targetPitchRef.current = -0.035;
  }, [focusedId, travellingId]);

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (simpleMode || reducedMotion || event.pointerType !== "mouse") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / Math.max(1, rect.width) - 0.5) * 2;
    const y = ((event.clientY - rect.top) / Math.max(1, rect.height) - 0.5) * 2;
    targetYawRef.current = x * -0.16;
    targetPitchRef.current = y * -0.075;
  }

  function handlePointerLeave() {
    if (focusedId || travellingId) return;
    targetYawRef.current = 0.08;
    targetPitchRef.current = -0.035;
  }

  function handleNavigate(event: ReactMouseEvent<HTMLAnchorElement>, studio: StudioDestination) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    if (simpleMode || reducedMotion || !webglAvailable) return;
    event.preventDefault();
    markStudioTravel("hub", studio.id);
    setFocusedId(studio.id);
    setTravellingId(studio.id);
    navigationTimerRef.current = setTimeout(() => router.push(studio.href), 520);
  }

  const staticPresentation = simpleMode || !webglAvailable || !ready;

  return (
    <section
      ref={stageRef}
      className={`${styles.stage} ${ready ? styles.ready : ""} ${staticPresentation ? styles.staticMode : ""}`}
      data-travelling={travellingId || undefined}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      aria-labelledby="studios-title"
    >
      <canvas ref={canvasRef} className={styles.canvas} aria-hidden="true" />

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
          {simpleMode ? "3D προβολή" : "Απλή προβολή"}
        </button>
      </div>

      <div className={styles.heroCopy}>
        <span>KONTA MOY · INTERACTIVE STUDIOS</span>
        <h1 id="studios-title">Μπες μέσα.<br /><em>Βρες το σωστό.</em></h1>
        <p>
          Τέσσερα εξειδικευμένα περιβάλλοντα. Η ίδια λογική αγοράς:
          πραγματικά προϊόντα, πραγματική διαθεσιμότητα και καθοδήγηση πριν από την επιλογή.
        </p>
      </div>

      <div className={styles.atrium} aria-hidden="true">
        <span>KONTA MOY</span>
        <strong>STUDIO DISTRICT</strong>
        <i />
      </div>

      <nav className={styles.portalLayer} aria-label="KONTA MOY Studios">
        {STUDIO_DESTINATIONS.map((studio, index) => (
          <StudioPortal
            key={studio.id}
            studio={studio}
            index={index}
            portalRef={(node) => {
              if (node) portalRefs.current.set(studio.id, node);
              else portalRefs.current.delete(studio.id);
            }}
            focused={focusedId === studio.id}
            travelling={travellingId === studio.id}
            onFocusChange={setFocusedId}
            onNavigate={handleNavigate}
          />
        ))}
      </nav>

      <div className={styles.statusBar}>
        <span>{webglAvailable && !simpleMode ? `3D ENGINE · ${tier.toUpperCase()}` : "SEMANTIC FALLBACK"}</span>
        <p>{simpleMode ? "Διάλεξε Studio από τη λίστα." : "Tap ένα Studio για να μπεις · η πλοήγηση παραμένει κανονικό URL."}</p>
      </div>

      <p className={styles.srStatus} aria-live="polite">
        {travellingId ? `Μετάβαση στο ${STUDIO_DESTINATIONS.find((studio) => studio.id === travellingId)?.title ?? "Studio"}` : ""}
      </p>
    </section>
  );
}
