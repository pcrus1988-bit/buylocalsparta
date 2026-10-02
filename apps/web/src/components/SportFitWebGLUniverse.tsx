"use client";

import type { PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./SportFitWebGLUniverse.module.css";

export type SportFitUniverseVisualProduct = Readonly<{
  id: string;
  familyId?: string;
  slug: string;
  title: string;
  brand?: string;
  categoryLabel?: string;
  previewImageSrc?: string;
  priceMinor: number;
  score?: number;
  technicalScore?: number;
  technicalCoverage?: number;
  matchedSize?: string;
  role?: string;
  reasons?: readonly string[];
}>;

type Props = Readonly<{
  products: readonly SportFitUniverseVisualProduct[];
  leavingIds?: ReadonlySet<string>;
  mode?: "cloud" | "finalists";
  selectedId?: string;
  onSelect?: (id: string) => void;
  busy?: boolean;
}>;

type NodeState = {
  id: string;
  product: SportFitUniverseVisualProduct;
  current: [number, number, number];
  target: [number, number, number];
  opacity: number;
  targetOpacity: number;
  size: number;
  targetSize: number;
  atlasIndex: number;
};

const MAX_DESKTOP_NODES = 64;
const MAX_MOBILE_NODES = 42;
const ATLAS_GRID = 8;
const ATLAS_CELL = 128;
const ATLAS_SIZE = ATLAS_GRID * ATLAS_CELL;

const VERTEX_SHADER = `
precision highp float;
attribute vec3 a_position;
attribute vec4 a_uvRect;
attribute float a_size;
attribute float a_opacity;
attribute float a_score;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
uniform float u_dpr;
varying vec4 v_uvRect;
varying float v_opacity;
varying float v_score;
varying float v_depth;

void main() {
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  float cx = cos(u_pitch);
  float sx = sin(u_pitch);

  vec3 p = a_position;
  p = vec3(
    cy * p.x + sy * p.z,
    p.y,
    -sy * p.x + cy * p.z
  );
  p = vec3(
    p.x,
    cx * p.y - sx * p.z,
    sx * p.y + cx * p.z
  );

  float depth = max(1.6, u_camera - p.z);
  float f = 1.92;
  float ndcX = (p.x * f / max(u_aspect, 0.55)) / depth;
  float ndcY = (p.y * f) / depth;
  float ndcZ = clamp((depth - 1.0) / 26.0 * 2.0 - 1.0, -1.0, 1.0);

  gl_Position = vec4(ndcX, ndcY, ndcZ, 1.0);
  gl_PointSize = clamp(a_size * (11.0 / depth) * u_dpr, 24.0 * u_dpr, 132.0 * u_dpr);

  v_uvRect = a_uvRect;
  v_opacity = a_opacity;
  v_score = a_score;
  v_depth = depth;
}
`;

const FRAGMENT_SHADER = `
precision mediump float;
uniform sampler2D u_atlas;
uniform float u_time;
varying vec4 v_uvRect;
varying float v_opacity;
varying float v_score;
varying float v_depth;

void main() {
  vec2 point = gl_PointCoord;
  vec2 centered = point - vec2(0.5);
  float radius = length(centered);
  if (radius > 0.5) discard;

  vec2 uv = v_uvRect.xy + point * v_uvRect.zw;
  vec4 texel = texture2D(u_atlas, uv);

  float rim = smoothstep(0.50, 0.42, radius) - smoothstep(0.43, 0.35, radius);
  float softEdge = 1.0 - smoothstep(0.45, 0.50, radius);
  float score = clamp(v_score / 100.0, 0.0, 1.0);
  float pulse = 0.92 + 0.08 * sin(u_time * 1.7 + v_depth);
  vec3 cyan = vec3(0.42, 0.98, 0.92);
  vec3 ice = vec3(0.92, 1.0, 0.98);

  vec3 imageColor = mix(vec3(0.055, 0.07, 0.075), texel.rgb, texel.a);
  vec3 glow = mix(ice, cyan, score) * rim * (0.55 + score * 1.4) * pulse;
  vec3 color = imageColor + glow;

  float imageAlpha = max(texel.a, 0.92);
  float alpha = softEdge * imageAlpha * v_opacity;
  if (alpha < 0.015) discard;
  gl_FragColor = vec4(color, alpha);
}
`;

const STAR_VERTEX_SHADER = `
precision highp float;
attribute vec3 a_position;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
uniform float u_dpr;
varying float v_depth;

void main() {
  float cy = cos(u_yaw * 0.28);
  float sy = sin(u_yaw * 0.28);
  float cx = cos(u_pitch * 0.18);
  float sx = sin(u_pitch * 0.18);
  vec3 p = a_position;
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);
  float depth = max(1.8, u_camera + 4.0 - p.z);
  float f = 1.92;
  gl_Position = vec4(
    (p.x * f / max(u_aspect, 0.55)) / depth,
    (p.y * f) / depth,
    clamp((depth - 1.0) / 34.0 * 2.0 - 1.0, -1.0, 1.0),
    1.0
  );
  gl_PointSize = clamp((15.0 / depth) * u_dpr, 1.0, 3.2 * u_dpr);
  v_depth = depth;
}
`;

const STAR_FRAGMENT_SHADER = `
precision mediump float;
varying float v_depth;
void main() {
  vec2 p = gl_PointCoord - vec2(0.5);
  if (dot(p,p) > 0.25) discard;
  float alpha = clamp(0.62 - v_depth * 0.018, 0.14, 0.52);
  gl_FragColor = vec4(0.60, 0.95, 0.91, alpha);
}
`;

function hashId(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededUnit(seed: number, shift: number): number {
  const mixed = Math.imul(seed ^ (seed >>> shift), 2654435761) >>> 0;
  return mixed / 4294967295;
}

function cloudTarget(product: SportFitUniverseVisualProduct, index: number): [number, number, number] {
  const seed = hashId(product.familyId || product.id);
  const score = typeof product.score === "number" ? product.score : 42;
  const technical = typeof product.technicalScore === "number" ? product.technicalScore : score;
  const strength = Math.max(score, technical);
  const theta = seededUnit(seed, 7) * Math.PI * 2 + index * 0.11;
  const phi = Math.acos(2 * seededUnit(seed, 13) - 1);
  const baseRadius = typeof product.score === "number"
    ? 2.1 + (100 - strength) / 17
    : 4.2 + seededUnit(seed, 17) * 2.8;
  const squash = 0.72;
  return [
    Math.sin(phi) * Math.cos(theta) * baseRadius,
    Math.cos(phi) * baseRadius * squash,
    Math.sin(phi) * Math.sin(theta) * baseRadius
  ];
}

function finalistTarget(index: number, count: number, selected: boolean): [number, number, number] {
  const center = (count - 1) / 2;
  const offset = index - center;
  const x = offset * 1.75;
  const y = 0.35 - Math.abs(offset) * 0.12 + (selected ? 0.42 : 0);
  const z = 1.65 - Math.abs(offset) * 0.5 + (selected ? 1.15 : 0);
  return [x, y, z];
}

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error("webgl_shader_create_failed");
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "webgl_shader_compile_failed";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl: WebGLRenderingContext, vertex: string, fragment: string): WebGLProgram {
  const program = gl.createProgram();
  if (!program) throw new Error("webgl_program_create_failed");
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertex);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragment);
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "webgl_program_link_failed";
    gl.deleteProgram(program);
    throw new Error(message);
  }
  return program;
}

function drawFallbackCell(
  context: CanvasRenderingContext2D,
  product: SportFitUniverseVisualProduct,
  x: number,
  y: number
) {
  context.fillStyle = "#101816";
  context.fillRect(x, y, ATLAS_CELL, ATLAS_CELL);
  context.strokeStyle = "rgba(116,255,236,.55)";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x + ATLAS_CELL / 2, y + ATLAS_CELL / 2, ATLAS_CELL * 0.39, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = "#c9fff6";
  context.font = "700 42px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText((product.brand || product.title || "S").slice(0, 1).toUpperCase(), x + ATLAS_CELL / 2, y + ATLAS_CELL / 2);
}

function fitImage(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  x: number,
  y: number
) {
  context.save();
  context.beginPath();
  context.arc(x + ATLAS_CELL / 2, y + ATLAS_CELL / 2, ATLAS_CELL * 0.44, 0, Math.PI * 2);
  context.clip();
  context.fillStyle = "#f5f1e8";
  context.fillRect(x, y, ATLAS_CELL, ATLAS_CELL);
  const padding = 12;
  const maxWidth = ATLAS_CELL - padding * 2;
  const maxHeight = ATLAS_CELL - padding * 2;
  const scale = Math.min(maxWidth / Math.max(1, image.naturalWidth), maxHeight / Math.max(1, image.naturalHeight));
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  context.drawImage(
    image,
    x + (ATLAS_CELL - width) / 2,
    y + (ATLAS_CELL - height) / 2,
    width,
    height
  );
  context.restore();
}

function atlasProxySrc(product: SportFitUniverseVisualProduct): string {
  return `/api/catalog-source-image/${encodeURIComponent(product.id)}`;
}

async function buildAtlas(products: readonly SportFitUniverseVisualProduct[]): Promise<HTMLCanvasElement> {
  const atlas = document.createElement("canvas");
  atlas.width = ATLAS_SIZE;
  atlas.height = ATLAS_SIZE;
  const context = atlas.getContext("2d", { alpha: true });
  if (!context) return atlas;
  context.clearRect(0, 0, ATLAS_SIZE, ATLAS_SIZE);

  products.forEach((product, index) => {
    const x = (index % ATLAS_GRID) * ATLAS_CELL;
    const y = Math.floor(index / ATLAS_GRID) * ATLAS_CELL;
    drawFallbackCell(context, product, x, y);
  });

  const jobs = products.map((product, index) => new Promise<void>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => {
      const x = (index % ATLAS_GRID) * ATLAS_CELL;
      const y = Math.floor(index / ATLAS_GRID) * ATLAS_CELL;
      fitImage(context, image, x, y);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = atlasProxySrc(product);
  }));

  await Promise.allSettled(jobs);
  return atlas;
}

function atlasUv(index: number): [number, number, number, number] {
  const col = index % ATLAS_GRID;
  const row = Math.floor(index / ATLAS_GRID);
  const cell = 1 / ATLAS_GRID;
  // Canvas Y is top-down; WebGL texture Y is bottom-up unless UNPACK_FLIP_Y_WEBGL is used.
  return [col * cell, row * cell, cell, cell];
}

function rotatePoint(
  point: readonly [number, number, number],
  yaw: number,
  pitch: number
): [number, number, number] {
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  const cx = Math.cos(pitch);
  const sx = Math.sin(pitch);
  const [x, y, z] = point;
  const x1 = cy * x + sy * z;
  const z1 = -sy * x + cy * z;
  return [x1, cx * y - sx * z1, sx * y + cx * z1];
}

function projectPoint(
  point: readonly [number, number, number],
  yaw: number,
  pitch: number,
  camera: number,
  width: number,
  height: number
): { x: number; y: number; depth: number } | undefined {
  if (!width || !height) return undefined;
  const [x, y, z] = rotatePoint(point, yaw, pitch);
  const depth = camera - z;
  if (depth <= 1.55) return undefined;
  const aspect = width / height;
  const f = 1.92;
  const ndcX = (x * f / Math.max(aspect, 0.55)) / depth;
  const ndcY = (y * f) / depth;
  return {
    x: (ndcX * 0.5 + 0.5) * width,
    y: (0.5 - ndcY * 0.5) * height,
    depth
  };
}

export function SportFitWebGLUniverse({
  products,
  leavingIds = new Set<string>(),
  mode = "cloud",
  selectedId,
  onSelect,
  busy = false
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Map<string, NodeState>>(new Map());
  const productsRef = useRef<readonly SportFitUniverseVisualProduct[]>(products);
  const animationRef = useRef<number | undefined>(undefined);
  const yawRef = useRef(0.18);
  const pitchRef = useRef(-0.08);
  const cameraRef = useRef(mode === "finalists" ? 10.5 : 12.5);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | undefined>(undefined);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const pinchDistanceRef = useRef<number | undefined>(undefined);
  const hoveredIdRef = useRef<string | undefined>(undefined);
  const [hoveredId, setHoveredId] = useState<string>();
  const [webglUnavailable, setWebglUnavailable] = useState(false);
  const [atlasReady, setAtlasReady] = useState(false);

  const visibleProducts = useMemo(() => {
    const max = typeof window !== "undefined" && window.innerWidth <= 700
      ? MAX_MOBILE_NODES
      : MAX_DESKTOP_NODES;
    return products.slice(0, mode === "finalists" ? 5 : max);
  }, [products, mode]);

  const hoveredProduct = useMemo(
    () => products.find((product) => product.id === hoveredId) ?? products.find((product) => product.id === selectedId),
    [hoveredId, products, selectedId]
  );

  useEffect(() => {
    productsRef.current = visibleProducts;
    const previous = nodesRef.current;
    const next = new Map<string, NodeState>();

    visibleProducts.forEach((product, index) => {
      const existing = previous.get(product.id);
      const leaving = leavingIds.has(product.id);
      const selected = selectedId === product.id;
      let target = mode === "finalists"
        ? finalistTarget(index, visibleProducts.length, selected)
        : cloudTarget(product, index);

      if (leaving) {
        const seed = hashId(product.id);
        target = [
          target[0] * 1.9 + (seed % 2 ? 2.5 : -2.5),
          target[1] * 1.7 + ((seed >>> 4) % 2 ? 1.8 : -1.8),
          -10 - seededUnit(seed, 21) * 7
        ];
      }

      const baseScore = product.score ?? product.technicalScore ?? 52;
      const targetSize = mode === "finalists"
        ? (selected ? 112 : 88)
        : 58 + Math.min(38, baseScore * 0.33);

      next.set(product.id, {
        id: product.id,
        product,
        current: existing?.current ?? [
          target[0] * 1.12,
          target[1] * 1.12,
          target[2] - 1.5
        ],
        target,
        opacity: existing?.opacity ?? (leaving ? 0.9 : 0),
        targetOpacity: leaving ? 0 : 1,
        size: existing?.size ?? targetSize * 0.72,
        targetSize,
        atlasIndex: index
      });
    });

    nodesRef.current = next;
  }, [visibleProducts, leavingIds, mode, selectedId]);

  useEffect(() => {
    let cancelled = false;
    setAtlasReady(false);
    void buildAtlas(visibleProducts).then((atlas) => {
      if (cancelled) return;
      const canvas = canvasRef.current;
      const gl = canvas?.getContext("webgl", {
        alpha: true,
        antialias: true,
        premultipliedAlpha: false,
        powerPreference: "high-performance"
      });
      if (!gl) {
        setWebglUnavailable(true);
        return;
      }
      const texture = gl.createTexture();
      if (!texture) {
        setWebglUnavailable(true);
        return;
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.bindTexture(gl.TEXTURE_2D, null);
      canvas.dataset.atlasVersion = String(Date.now());
      (canvas as HTMLCanvasElement & { __sportAtlas?: WebGLTexture }).__sportAtlas = texture;
      setAtlasReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [visibleProducts]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: true,
      premultipliedAlpha: false,
      powerPreference: "high-performance"
    });
    if (!gl) {
      setWebglUnavailable(true);
      return;
    }

    let program: WebGLProgram;
    let starProgram: WebGLProgram;
    try {
      program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
      starProgram = createProgram(gl, STAR_VERTEX_SHADER, STAR_FRAGMENT_SHADER);
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const positionBuffer = gl.createBuffer();
    const uvBuffer = gl.createBuffer();
    const sizeBuffer = gl.createBuffer();
    const opacityBuffer = gl.createBuffer();
    const scoreBuffer = gl.createBuffer();
    const starBuffer = gl.createBuffer();
    if (!positionBuffer || !uvBuffer || !sizeBuffer || !opacityBuffer || !scoreBuffer || !starBuffer) {
      setWebglUnavailable(true);
      return;
    }

    const starCount = 190;
    const starData = new Float32Array(starCount * 3);
    for (let index = 0; index < starCount; index += 1) {
      const seed = hashId(`star-${index}`);
      const radius = 8 + seededUnit(seed, 6) * 13;
      const theta = seededUnit(seed, 11) * Math.PI * 2;
      const phi = Math.acos(2 * seededUnit(seed, 18) - 1);
      starData[index * 3] = Math.sin(phi) * Math.cos(theta) * radius;
      starData[index * 3 + 1] = Math.cos(phi) * radius * 0.72;
      starData[index * 3 + 2] = Math.sin(phi) * Math.sin(theta) * radius;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, starBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, starData, gl.STATIC_DRAW);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let lastTime = performance.now();

    function resize() {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.55);
      const width = Math.max(1, Math.round(rect.width * dpr));
      const height = Math.max(1, Math.round(rect.height * dpr));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      gl.viewport(0, 0, width, height);
    }

    function bindAttribute(
      targetProgram: WebGLProgram,
      buffer: WebGLBuffer,
      name: string,
      size: number,
      data?: Float32Array
    ) {
      const location = gl.getAttribLocation(targetProgram, name);
      if (location < 0) return;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      if (data) gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0);
    }

    function uniform1f(targetProgram: WebGLProgram, name: string, value: number) {
      const location = gl.getUniformLocation(targetProgram, name);
      if (location) gl.uniform1f(location, value);
    }

    function frame(now: number) {
      resize();
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      if (!reduceMotion && !dragRef.current && mode === "cloud") {
        yawRef.current += dt * 0.035;
      }

      const nodes = [...nodesRef.current.values()];
      const ease = 1 - Math.pow(0.0005, dt);
      nodes.forEach((node) => {
        node.current[0] += (node.target[0] - node.current[0]) * ease;
        node.current[1] += (node.target[1] - node.current[1]) * ease;
        node.current[2] += (node.target[2] - node.current[2]) * ease;
        node.opacity += (node.targetOpacity - node.opacity) * ease;
        node.size += (node.targetSize - node.size) * ease;
      });

      const positions = new Float32Array(nodes.length * 3);
      const uvs = new Float32Array(nodes.length * 4);
      const sizes = new Float32Array(nodes.length);
      const opacities = new Float32Array(nodes.length);
      const scores = new Float32Array(nodes.length);

      nodes.forEach((node, index) => {
        positions.set(node.current, index * 3);
        uvs.set(atlasUv(node.atlasIndex), index * 4);
        sizes[index] = node.size;
        opacities[index] = node.opacity;
        scores[index] = node.product.technicalScore ?? node.product.score ?? 48;
      });

      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.55);
      const aspect = rect.width / Math.max(1, rect.height);

      gl.clearColor(0.018, 0.027, 0.027, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);

      gl.useProgram(starProgram);
      bindAttribute(starProgram, starBuffer, "a_position", 3);
      uniform1f(starProgram, "u_yaw", yawRef.current);
      uniform1f(starProgram, "u_pitch", pitchRef.current);
      uniform1f(starProgram, "u_camera", cameraRef.current);
      uniform1f(starProgram, "u_aspect", aspect);
      uniform1f(starProgram, "u_dpr", dpr);
      gl.drawArrays(gl.POINTS, 0, starCount);

      gl.useProgram(program);
      bindAttribute(program, positionBuffer, "a_position", 3, positions);
      bindAttribute(program, uvBuffer, "a_uvRect", 4, uvs);
      bindAttribute(program, sizeBuffer, "a_size", 1, sizes);
      bindAttribute(program, opacityBuffer, "a_opacity", 1, opacities);
      bindAttribute(program, scoreBuffer, "a_score", 1, scores);

      uniform1f(program, "u_yaw", yawRef.current);
      uniform1f(program, "u_pitch", pitchRef.current);
      uniform1f(program, "u_camera", cameraRef.current);
      uniform1f(program, "u_aspect", aspect);
      uniform1f(program, "u_dpr", dpr);
      uniform1f(program, "u_time", now / 1000);

      const atlas = (canvas as HTMLCanvasElement & { __sportAtlas?: WebGLTexture }).__sportAtlas;
      if (atlas && atlasReady) {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, atlas);
        const atlasLocation = gl.getUniformLocation(program, "u_atlas");
        if (atlasLocation) gl.uniform1i(atlasLocation, 0);
      }
      gl.drawArrays(gl.POINTS, 0, nodes.length);

      animationRef.current = requestAnimationFrame(frame);
    }

    animationRef.current = requestAnimationFrame(frame);
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      observer.disconnect();
      gl.deleteProgram(program);
      gl.deleteProgram(starProgram);
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(uvBuffer);
      gl.deleteBuffer(sizeBuffer);
      gl.deleteBuffer(opacityBuffer);
      gl.deleteBuffer(scoreBuffer);
      gl.deleteBuffer(starBuffer);
    };
  }, [atlasReady, mode]);

  function pick(clientX: number, clientY: number): string | undefined {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let closest: { id: string; distance: number; depth: number } | undefined;

    for (const node of nodesRef.current.values()) {
      if (node.opacity < 0.18) continue;
      const projected = projectPoint(
        node.current,
        yawRef.current,
        pitchRef.current,
        cameraRef.current,
        rect.width,
        rect.height
      );
      if (!projected) continue;
      const radius = Math.max(19, Math.min(76, node.size * 11 / projected.depth)) * 0.58;
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance > radius) continue;
      if (!closest || distance < closest.distance || (Math.abs(distance - closest.distance) < 4 && projected.depth < closest.depth)) {
        closest = { id: node.id, distance, depth: projected.depth };
      }
    }
    return closest?.id;
  }

  function updateHover(clientX: number, clientY: number) {
    const id = pick(clientX, clientY);
    if (hoveredIdRef.current === id) return;
    hoveredIdRef.current = id;
    setHoveredId(id);
    if (canvasRef.current) canvasRef.current.style.cursor = id ? "pointer" : dragRef.current ? "grabbing" : "grab";
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    canvas.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    canvas.style.cursor = "grabbing";
    if (pointersRef.current.size === 2) {
      const values = [...pointersRef.current.values()];
      pinchDistanceRef.current = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const previousPointer = pointersRef.current.get(event.pointerId);
    pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointersRef.current.size >= 2) {
      const values = [...pointersRef.current.values()].slice(0, 2);
      const distance = Math.hypot(values[0].x - values[1].x, values[0].y - values[1].y);
      if (pinchDistanceRef.current) {
        cameraRef.current = Math.max(7.2, Math.min(18.5, cameraRef.current - (distance - pinchDistanceRef.current) * 0.018));
      }
      pinchDistanceRef.current = distance;
      return;
    }

    const drag = dragRef.current;
    if (drag && drag.pointerId === event.pointerId && previousPointer) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      yawRef.current += dx * 0.0068;
      pitchRef.current = Math.max(-0.82, Math.min(0.82, pitchRef.current + dy * 0.0055));
      drag.x = event.clientX;
      drag.y = event.clientY;
      return;
    }

    updateHover(event.clientX, event.clientY);
  }

  function finishPointer(event: ReactPointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const wasClick = drag?.pointerId === event.pointerId && !drag.moved;
    pointersRef.current.delete(event.pointerId);
    if (pointersRef.current.size < 2) pinchDistanceRef.current = undefined;
    if (drag?.pointerId === event.pointerId) dragRef.current = undefined;
    event.currentTarget.style.cursor = "grab";

    if (wasClick) {
      const id = pick(event.clientX, event.clientY);
      if (id) {
        setHoveredId(id);
        hoveredIdRef.current = id;
        onSelect?.(id);
      }
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    event.preventDefault();
    cameraRef.current = Math.max(7.2, Math.min(18.5, cameraRef.current + event.deltaY * 0.007));
  }

  if (webglUnavailable) {
    return (
      <div className={styles.fallback} role="img" aria-label="Product universe fallback">
        {visibleProducts.slice(0, 20).map((product) => (
          <button type="button" key={product.id} onClick={() => onSelect?.(product.id)}>
            <img src={atlasProxySrc(product)} alt="" loading="lazy" />
            <span>{product.brand || product.title}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Interactive 3D product universe. Drag to rotate, pinch or wheel to zoom, and tap a product to focus it."
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishPointer}
        onPointerCancel={finishPointer}
        onPointerLeave={(event) => {
          if (!dragRef.current) {
            setHoveredId(undefined);
            hoveredIdRef.current = undefined;
            event.currentTarget.style.cursor = "grab";
          }
        }}
        onWheel={handleWheel}
      />

      <div className={styles.reticle} aria-hidden="true">
        <span />
        <i />
      </div>

      <div className={styles.hudTop} aria-hidden="true">
        <span>WEBGL · LIVE CATALOGUE</span>
        <span>{mode === "finalists" ? "TOP 5 ORBIT" : "3D MATCH SPACE"}</span>
      </div>

      <div className={styles.controls}>
        <span>DRAG · ROTATE</span>
        <span>PINCH/WHEEL · ZOOM</span>
        <span>TAP · FOCUS</span>
      </div>

      {busy ? <div className={styles.scanning}><i /><span>RECALCULATING MATCH SPACE</span></div> : null}

      {hoveredProduct ? (
        <div className={styles.productHud}>
          <span>{hoveredProduct.brand || hoveredProduct.categoryLabel || "SPORT"}</span>
          <strong>{hoveredProduct.title}</strong>
          <div>
            {typeof hoveredProduct.score === "number" ? <b>{hoveredProduct.score}% MATCH</b> : <b>LIVE PRODUCT</b>}
            {hoveredProduct.matchedSize ? <small>EU {hoveredProduct.matchedSize}</small> : null}
          </div>
        </div>
      ) : (
        <div className={styles.productHud}>
          <span>EXPLORE THE SPACE</span>
          <strong>{mode === "finalists" ? "Πέντε προϊόντα. Ένα τελικό πεδίο." : "Πιάσε το σύμπαν και περιστρέψ’ το."}</strong>
          <div><b>REAL 3D</b><small>LIVE RULES</small></div>
        </div>
      )}
    </div>
  );
}
