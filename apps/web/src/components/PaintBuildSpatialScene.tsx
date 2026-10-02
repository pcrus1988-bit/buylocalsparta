"use client";

import { useEffect, useRef } from "react";
import type { BuildModuleKey } from "../lib/build-consultant";
import { useStudioRuntime } from "./StudioExperienceRuntime";
import styles from "./PaintBuildSpatialScene.module.css";

type Props = Readonly<{
  module?: BuildModuleKey;
  progress?: number;
  accent?: string;
  result?: boolean;
}>;

type Vertex = readonly [number, number, number, number];

const VERTEX = `
precision highp float;
attribute vec4 a_vertex;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
uniform float u_dpr;
uniform float u_time;
varying float v_kind;
varying float v_depth;

void main() {
  float cy = cos(u_yaw);
  float sy = sin(u_yaw);
  float cx = cos(u_pitch);
  float sx = sin(u_pitch);

  vec3 p = a_vertex.xyz;
  p = vec3(cy * p.x + sy * p.z, p.y, -sy * p.x + cy * p.z);
  p = vec3(p.x, cx * p.y - sx * p.z, sx * p.y + cx * p.z);

  float depth = max(1.25, u_camera - p.z);
  float f = 1.82;
  gl_Position = vec4(
    (p.x * f / max(u_aspect, 0.6)) / depth,
    (p.y * f) / depth,
    clamp((depth - 1.0) / 28.0 * 2.0 - 1.0, -1.0, 1.0),
    1.0
  );
  gl_PointSize = clamp((a_vertex.w > 2.5 ? 13.0 : 5.0) * (9.0 / depth) * u_dpr, 1.0, 9.0 * u_dpr);
  v_kind = a_vertex.w;
  v_depth = depth;
}
`;

const FRAGMENT = `
precision mediump float;
uniform vec3 u_accent;
uniform float u_time;
uniform float u_result;
varying float v_kind;
varying float v_depth;

void main() {
  vec3 base = vec3(0.48, 0.47, 0.43);
  vec3 ivory = vec3(0.95, 0.92, 0.86);
  vec3 color = v_kind < 0.5 ? base : (v_kind < 1.5 ? ivory : u_accent);
  float alpha = v_kind < 0.5 ? 0.13 : (v_kind < 1.5 ? 0.34 : 0.72);
  if (v_kind > 2.5) {
    vec2 p = gl_PointCoord - vec2(0.5);
    if (dot(p,p) > 0.25) discard;
    alpha *= 0.38 + 0.18 * sin(u_time * 1.5 + v_depth);
  }
  if (u_result > 0.5 && v_kind > 1.5) {
    alpha *= 0.82 + 0.18 * sin(u_time * 2.2 + v_depth);
  }
  gl_FragColor = vec4(color, alpha);
}
`;

function shader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
  const value = gl.createShader(type);
  if (!value) throw new Error("paint_build_shader_create_failed");
  gl.shaderSource(value, source);
  gl.compileShader(value);
  if (!gl.getShaderParameter(value, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(value) || "paint_build_shader_compile_failed";
    gl.deleteShader(value);
    throw new Error(message);
  }
  return value;
}

function program(gl: WebGLRenderingContext): WebGLProgram {
  const value = gl.createProgram();
  if (!value) throw new Error("paint_build_program_create_failed");
  const vs = shader(gl, gl.VERTEX_SHADER, VERTEX);
  const fs = shader(gl, gl.FRAGMENT_SHADER, FRAGMENT);
  gl.attachShader(value, vs);
  gl.attachShader(value, fs);
  gl.linkProgram(value);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(value, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(value) || "paint_build_program_link_failed";
    gl.deleteProgram(value);
    throw new Error(message);
  }
  return value;
}

function addLine(target: Vertex[], a: readonly [number, number, number], b: readonly [number, number, number], kind = 0) {
  target.push([a[0], a[1], a[2], kind], [b[0], b[1], b[2], kind]);
}

function rectangle(target: Vertex[], x1: number, y1: number, x2: number, y2: number, z: number, kind: number) {
  addLine(target, [x1,y1,z], [x2,y1,z], kind);
  addLine(target, [x2,y1,z], [x2,y2,z], kind);
  addLine(target, [x2,y2,z], [x1,y2,z], kind);
  addLine(target, [x1,y2,z], [x1,y1,z], kind);
}

function baseRoom(lines: Vertex[]) {
  for (let x = -8; x <= 8; x += 1) addLine(lines, [x,-2.7,-7], [x,-2.7,5], 0);
  for (let z = -7; z <= 5; z += 1) addLine(lines, [-8,-2.7,z], [8,-2.7,z], 0);
  rectangle(lines, -5.7, -2.65, 5.7, 3.7, -4.8, 0);
  addLine(lines, [-5.7,-2.65,-4.8], [-8,-2.7,2.5], 0);
  addLine(lines, [5.7,-2.65,-4.8], [8,-2.7,2.5], 0);
}

function buildProject(module: BuildModuleKey | undefined, progress: number) {
  const lines: Vertex[] = [];
  const points: Vertex[] = [];
  baseRoom(lines);

  const reveal = Math.max(0.12, Math.min(1, progress || 0.12));

  if (!module) {
    const positions = [
      [-3.2,1.25,-1.1], [3.2,1.25,-1.1], [-3.2,-1.15,-.2], [3.2,-1.15,-.2]
    ] as const;
    positions.forEach(([x,y,z], index) => {
      rectangle(lines, x-.9, y-.7, x+.9, y+.7, z, index % 2 ? 2 : 1);
      addLine(lines, [x-.55,y,z+.1], [x+.55,y,z+.1], 2);
    });
  }

  if (module === "paint") {
    rectangle(lines, -3.8, -2.15, 3.8, 2.85, -1.9, 1);
    for (let x = -3; x <= 3; x += 1) addLine(lines, [x,-2.15,-1.88], [x,2.85,-1.88], x < -3 + reveal * 6.2 ? 2 : 0);
    for (let y = -1.4; y <= 2.2; y += .9) addLine(lines, [-3.8,y,-1.86], [3.8,y,-1.86], y < -1.4 + reveal * 4.5 ? 2 : 0);
    addLine(lines, [2.7,-.4,.5], [2.7,1.8,.5], 2);
    addLine(lines, [2.1,1.8,.5], [3.3,1.8,.5], 2);
    addLine(lines, [3.3,1.8,.5], [3.3,2.15,.5], 2);
  } else if (module === "waterproofing") {
    addLine(lines, [-4,-1.35,-1.5], [0,2.35,-2.4], 1);
    addLine(lines, [0,2.35,-2.4], [4,-1.35,-1.5], 1);
    addLine(lines, [-4,-1.35,-1.5], [4,-1.35,-1.5], 1);
    for (let i=0;i<18;i+=1) {
      const x=-3.6+(i%9)*.9;
      const y=1.8-Math.floor(i/9)*1.8;
      points.push([x,y,-.8,3]);
    }
    addLine(lines, [-3.2,-.9,-1.2], [3.2,-.9,-1.2], 2);
    addLine(lines, [-2.5,-.25,-1.5], [2.5,-.25,-1.5], 2);
  } else if (module === "insulation") {
    rectangle(lines, -3.7, -2.3, 3.7, 1.8, -1.8, 1);
    addLine(lines, [-4.2,1.8,-1.8], [0,3.45,-1.8], 1);
    addLine(lines, [0,3.45,-1.8], [4.2,1.8,-1.8], 1);
    for (let offset=.18; offset<=.7; offset+=.17) {
      rectangle(lines,-3.7-offset,-2.3-offset,3.7+offset,1.8+offset,-1.75+offset*.15,2);
    }
  } else if (module === "repair") {
    rectangle(lines,-3.8,-2.2,3.8,2.8,-1.9,1);
    const crack = [
      [-.4,2.45,-1.75],[-.8,1.65,-1.72],[-.2,.9,-1.69],[-.95,.15,-1.66],[-.35,-.65,-1.63],[-.7,-1.7,-1.6]
    ] as const;
    for(let i=0;i<crack.length-1;i+=1) addLine(lines,crack[i],crack[i+1],2);
    addLine(lines,[-.8,1.65,-1.72],[-1.55,1.2,-1.7],2);
    addLine(lines,[-.35,-.65,-1.63],[.5,-1.05,-1.61],2);
  }

  for (let i=0;i<54;i+=1) {
    const angle=(i/54)*Math.PI*2;
    const radius=4.5+(i%7)*.34;
    points.push([Math.cos(angle)*radius,Math.sin(angle*1.7)*2.6-0.2,Math.sin(angle)*2.4-1.5,3]);
  }

  return {
    lines: new Float32Array(lines.flat()),
    points: new Float32Array(points.flat())
  };
}

function hexToRgb(hex: string): [number, number, number] {
  const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!match) return [0.80,0.70,0.48];
  return [
    parseInt(match[1],16)/255,
    parseInt(match[2],16)/255,
    parseInt(match[3],16)/255
  ];
}

export function PaintBuildSpatialScene({ module, progress = 0, accent = "#CBB27A", result = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);
  const { qualityTier, reducedMotion } = useStudioRuntime();

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: qualityTier !== "lite",
      depth: false,
      powerPreference: "high-performance"
    });
    if (!gl) return;

    let activeProgram: WebGLProgram | null = null;
    let lineBuffer: WebGLBuffer | null = null;
    let pointBuffer: WebGLBuffer | null = null;
    let observer: ResizeObserver | null = null;
    let disposed = false;

    try {
      activeProgram = program(gl);
      const scene = buildProject(module, progress);
      lineBuffer = gl.createBuffer();
      pointBuffer = gl.createBuffer();
      if (!lineBuffer || !pointBuffer) throw new Error("paint_build_buffer_create_failed");

      const vertexLocation = gl.getAttribLocation(activeProgram,"a_vertex");
      const yawLocation = gl.getUniformLocation(activeProgram,"u_yaw");
      const pitchLocation = gl.getUniformLocation(activeProgram,"u_pitch");
      const cameraLocation = gl.getUniformLocation(activeProgram,"u_camera");
      const aspectLocation = gl.getUniformLocation(activeProgram,"u_aspect");
      const dprLocation = gl.getUniformLocation(activeProgram,"u_dpr");
      const timeLocation = gl.getUniformLocation(activeProgram,"u_time");
      const accentLocation = gl.getUniformLocation(activeProgram,"u_accent");
      const resultLocation = gl.getUniformLocation(activeProgram,"u_result");
      const [r,g,b] = hexToRgb(accent);
      const dprCap = qualityTier === "high" ? 1.6 : qualityTier === "balanced" ? 1.35 : 1;

      gl.useProgram(activeProgram);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

      gl.bindBuffer(gl.ARRAY_BUFFER,lineBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,scene.lines,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,pointBuffer);
      gl.bufferData(gl.ARRAY_BUFFER,scene.points,gl.STATIC_DRAW);

      const resize=()=>{
        const rect=host.getBoundingClientRect();
        const dpr=Math.min(window.devicePixelRatio||1,dprCap);
        canvas.width=Math.max(1,Math.floor(rect.width*dpr));
        canvas.height=Math.max(1,Math.floor(rect.height*dpr));
        canvas.style.width=`${rect.width}px`;
        canvas.style.height=`${rect.height}px`;
        gl.viewport(0,0,canvas.width,canvas.height);
      };
      observer=new ResizeObserver(resize);
      observer.observe(host);
      resize();

      const bind=(buffer:WebGLBuffer)=>{
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.enableVertexAttribArray(vertexLocation);
        gl.vertexAttribPointer(vertexLocation,4,gl.FLOAT,false,0,0);
      };

      const render=(time:number)=>{
        if(disposed)return;
        const width=host.clientWidth;
        const height=host.clientHeight;
        const dpr=Math.min(window.devicePixelRatio||1,dprCap);
        gl.clearColor(0,0,0,0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.useProgram(activeProgram);
        gl.uniform1f(yawLocation,reducedMotion ? -0.05 : -0.06+Math.sin(time*.00018)*.045);
        gl.uniform1f(pitchLocation,-0.055);
        gl.uniform1f(cameraLocation,11.2);
        gl.uniform1f(aspectLocation,width/Math.max(1,height));
        gl.uniform1f(dprLocation,dpr);
        gl.uniform1f(timeLocation,time/1000);
        gl.uniform3f(accentLocation,r,g,b);
        gl.uniform1f(resultLocation,result?1:0);

        bind(lineBuffer);
        gl.drawArrays(gl.LINES,0,scene.lines.length/4);
        bind(pointBuffer);
        gl.drawArrays(gl.POINTS,0,scene.points.length/4);

        if(!reducedMotion) frameRef.current=requestAnimationFrame(render);
      };

      render(performance.now());
    } catch(error) {
      console.error("[paint-build] spatial scene unavailable",error);
    }

    return()=>{
      disposed=true;
      observer?.disconnect();
      if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
      if(lineBuffer)gl.deleteBuffer(lineBuffer);
      if(pointBuffer)gl.deleteBuffer(pointBuffer);
      if(activeProgram)gl.deleteProgram(activeProgram);
    };
  },[accent,module,progress,qualityTier,reducedMotion,result]);

  return (
    <div className={styles.scene} aria-hidden="true">
      <canvas ref={canvasRef} />
      <div className={styles.vignette} />
      <div className={styles.floorGlow} />
    </div>
  );
}
