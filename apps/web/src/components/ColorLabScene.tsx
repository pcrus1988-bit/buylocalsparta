"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { createStudioProgram, hexToStudioRgb, resizeStudioCanvas, studioDprCap } from "../lib/studio-webgl";
import { useStudioRuntime } from "./StudioExperienceRuntime";
import styles from "./ColorLabScene.module.css";

export type ColorLabItem = Readonly<{
  id: string;
  slug: string;
  title: string;
  imageSrc: string;
  colorHex: string;
  match: number;
}>;

type Props = Readonly<{
  selectedHex: string;
  selectedLabel: string;
  studioLabel: string;
  items: readonly ColorLabItem[];
}>;

type SceneInput = Readonly<{
  selectedHex: string;
  items: readonly ColorLabItem[];
}>;

const VERTEX = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_color;
attribute float a_alpha;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
varying vec3 v_color;
varying float v_alpha;

void main(){
  float cy=cos(u_yaw);
  float sy=sin(u_yaw);
  float cx=cos(u_pitch);
  float sx=sin(u_pitch);
  vec3 p=a_position;
  p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
  p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
  float depth=max(1.2,u_camera-p.z);
  float f=1.82;
  gl_Position=vec4((p.x*f/max(u_aspect,.62))/depth,(p.y*f)/depth,clamp((depth-1.0)/28.0*2.0-1.0,-1.0,1.0),1.0);
  v_color=a_color;
  v_alpha=a_alpha;
}
`;

const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;
void main(){
  gl_FragColor=vec4(v_color,v_alpha);
}
`;

function pushVertex(target:number[],p:readonly[number,number,number],c:readonly[number,number,number],a:number){
  target.push(p[0],p[1],p[2],c[0],c[1],c[2],a);
}

function line(target:number[],a:readonly[number,number,number],b:readonly[number,number,number],c:readonly[number,number,number],alpha:number){
  pushVertex(target,a,c,alpha);pushVertex(target,b,c,alpha);
}

function rect(target:number[],x1:number,y1:number,x2:number,y2:number,z:number,c:readonly[number,number,number],alpha:number){
  line(target,[x1,y1,z],[x2,y1,z],c,alpha);
  line(target,[x2,y1,z],[x2,y2,z],c,alpha);
  line(target,[x2,y2,z],[x1,y2,z],c,alpha);
  line(target,[x1,y2,z],[x1,y1,z],c,alpha);
}

function buildLabScene(input:SceneInput){
  const values:number[]=[];
  const neutral:[number,number,number]=[.30,.29,.28];
  const selected=hexToStudioRgb(input.selectedHex,[.8,.5,.5]);

  // Lab room / sample wall.
  rect(values,-5.8,-2.5,5.8,3.8,-5.1,neutral,.32);
  line(values,[-5.8,-2.5,-5.1],[-7.7,-2.8,3.5],neutral,.22);
  line(values,[5.8,-2.5,-5.1],[7.7,-2.8,3.5],neutral,.22);

  // Swatch wall grid.
  for(let row=0;row<3;row+=1){
    for(let col=0;col<6;col+=1){
      const index=row*6+col;
      const item=input.items[index];
      const color=item?hexToStudioRgb(item.colorHex,[.55,.5,.5]):neutral;
      const x=-5.05+col*1.68;
      const y=2.85-row*1.42;
      rect(values,x,y-1.02,x+1.24,y,-4.82,color,item?.match?(.28+item.match/250):.11);
    }
  }

  // Main selected sample board.
  rect(values,-2.05,-1.75,2.05,2.45,-4.55,selected,.82);
  rect(values,-2.28,-1.98,2.28,2.68,-4.62,[.92,.90,.86],.42);

  // Material/sample bench.
  line(values,[-4.9,-1.85,-2.35],[4.9,-1.85,-2.35],[.68,.64,.58],.48);
  line(values,[-4.45,-2.55,-2.05],[-4.45,-1.85,-2.35],[.68,.64,.58],.38);
  line(values,[4.45,-2.55,-2.05],[4.45,-1.85,-2.35],[.68,.64,.58],.38);

  // Three comparison sample cards on bench.
  input.items.slice(0,3).forEach((item,index)=>{
    const color=hexToStudioRgb(item.colorHex,[.55,.5,.5]);
    const x=-2.35+index*2.35;
    rect(values,x,-1.45,x+1.35,-.35,-1.95,color,.68);
  });

  return new Float32Array(values);
}

export function ColorLabScene({selectedHex,selectedLabel,studioLabel,items}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const frameRef=useRef<number|null>(null);
  const uploadRef=useRef<(()=>void)|null>(null);
  const sceneInputRef=useRef<SceneInput>({selectedHex,items});
  const drawCountRef=useRef(0);
  const {qualityTier,reducedMotion}=useStudioRuntime();
  const visibleItems=useMemo(()=>items.slice(0,8),[items]);
  sceneInputRef.current={selectedHex,items:visibleItems};

  useEffect(()=>{
    uploadRef.current?.();
  },[selectedHex,visibleItems]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const host=canvas?.parentElement;
    if(!canvas||!host)return;

    const gl=canvas.getContext("webgl",{alpha:true,antialias:qualityTier!=="lite",depth:false,powerPreference:"high-performance"});
    if(!gl)return;

    let program:WebGLProgram|null=null;
    let buffer:WebGLBuffer|null=null;
    let observer:ResizeObserver|null=null;
    let disposed=false;

    try{
      const activeProgram=createStudioProgram(gl,VERTEX,FRAGMENT,"color_lab");
      program=activeProgram;
      const activeBuffer=gl.createBuffer();
      if(!activeBuffer)throw new Error("color_lab_buffer_create_failed");
      buffer=activeBuffer;

      gl.useProgram(activeProgram);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

      const stride=7*Float32Array.BYTES_PER_ELEMENT;
      const position=gl.getAttribLocation(activeProgram,"a_position");
      const color=gl.getAttribLocation(activeProgram,"a_color");
      const alpha=gl.getAttribLocation(activeProgram,"a_alpha");
      const yaw=gl.getUniformLocation(activeProgram,"u_yaw");
      const pitch=gl.getUniformLocation(activeProgram,"u_pitch");
      const camera=gl.getUniformLocation(activeProgram,"u_camera");
      const aspect=gl.getUniformLocation(activeProgram,"u_aspect");
      const dprCap=studioDprCap(qualityTier,{high:1.5,balanced:1.3,lite:1});

      gl.bindBuffer(gl.ARRAY_BUFFER,activeBuffer);
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position,3,gl.FLOAT,false,stride,0);
      gl.enableVertexAttribArray(color);
      gl.vertexAttribPointer(color,3,gl.FLOAT,false,stride,3*Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(alpha);
      gl.vertexAttribPointer(alpha,1,gl.FLOAT,false,stride,6*Float32Array.BYTES_PER_ELEMENT);

      const upload=()=>{
        const scene=buildLabScene(sceneInputRef.current);
        gl.bindBuffer(gl.ARRAY_BUFFER,activeBuffer);
        gl.bufferData(gl.ARRAY_BUFFER,scene,gl.DYNAMIC_DRAW);
        drawCountRef.current=scene.length/7;
      };
      uploadRef.current=upload;
      upload();

      const resize=()=>{resizeStudioCanvas(canvas,host,gl,dprCap);};
      observer=new ResizeObserver(resize);observer.observe(host);resize();

      const render=(time:number)=>{
        if(disposed)return;
        const width=host.clientWidth,height=host.clientHeight;
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(activeProgram);
        gl.uniform1f(yaw,reducedMotion?-.035:-.035+Math.sin(time*.00016)*.015);
        gl.uniform1f(pitch,-.045);
        gl.uniform1f(camera,10.9);
        gl.uniform1f(aspect,width/Math.max(1,height));
        gl.drawArrays(gl.LINES,0,drawCountRef.current);
        if(!reducedMotion)frameRef.current=requestAnimationFrame(render);
      };
      render(performance.now());
    }catch(error){console.error("[color-finder] shade lab unavailable",error);}

    return()=>{
      disposed=true;
      uploadRef.current=null;
      observer?.disconnect();
      if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
      if(buffer)gl.deleteBuffer(buffer);
      if(program)gl.deleteProgram(program);
    };
  },[qualityTier,reducedMotion]);

  return(
    <div className={styles.lab}>
      <canvas ref={canvasRef} aria-hidden="true"/>
      <div className={styles.sampleBoard} style={{"--selected-color":selectedHex} as CSSProperties}>
        <span>SELECTED SAMPLE</span>
        <strong>{selectedLabel}</strong>
        <small>{selectedHex.toUpperCase()}</small>
      </div>

      <div className={styles.sampleShelf} aria-label={`Κοντινότερα χρωματικά δείγματα στο ${selectedLabel}`}>
        {visibleItems.map((item,index)=>(
          <Link
            key={item.id}
            href={`/product/${encodeURIComponent(item.slug||item.id)}`}
            className={styles.sampleCard}
            style={{"--sample-color":item.colorHex,"--sample-rank":index} as CSSProperties}
            title={`${item.title} · ${item.match}% match`}
          >
            <div className={styles.sampleImage}><img src={item.imageSrc} alt="" loading="lazy" decoding="async"/></div>
            <i aria-hidden="true"/>
            <span>{item.match}%</span>
          </Link>
        ))}
      </div>

      <div className={styles.caption}>
        <span>{studioLabel} · SHADE LAB</span>
        <strong>{visibleItems.length ? `${visibleItems.length} CLOSEST SAMPLES` : "CATALOGUE LOADING"}</strong>
        <small>Τα προϊόντα μπαίνουν σε σειρά εργαστηρίου από το καλύτερο προς το πιο μακρινό χρωματικό ταίριασμα.</small>
      </div>
    </div>
  );
}
