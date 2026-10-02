"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, type CSSProperties } from "react";
import { createStudioProgram, hexToStudioRgb, resizeStudioCanvas, studioDprCap } from "../lib/studio-webgl";
import { useStudioRuntime } from "./StudioExperienceRuntime";
import styles from "./ColorSpatialUniverse.module.css";

export type ColorSpatialItem = Readonly<{
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
  items: readonly ColorSpatialItem[];
}>;

const VERTEX = `
precision highp float;
attribute vec3 a_position;
attribute vec3 a_color;
attribute float a_size;
attribute float a_alpha;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
uniform float u_dpr;
uniform float u_time;
varying vec3 v_color;
varying float v_alpha;
varying float v_depth;

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
  gl_PointSize=clamp(a_size*(10.0/depth)*u_dpr,1.0,18.0*u_dpr);
  v_color=a_color;
  v_alpha=a_alpha;
  v_depth=depth;
}
`;

const FRAGMENT = `
precision mediump float;
uniform float u_time;
varying vec3 v_color;
varying float v_alpha;
varying float v_depth;

void main(){
  vec2 q=gl_PointCoord-vec2(.5);
  float d=dot(q,q);
  if(d>.25)discard;
  float glow=1.0-smoothstep(.02,.25,d);
  float pulse=.88+.12*sin(u_time*1.7+v_depth);
  gl_FragColor=vec4(v_color,glow*v_alpha*pulse);
}
`;

function seeded(index:number,salt:number){
  let value=Math.imul(index+31,1103515245)+Math.imul(salt+17,12345);
  value^=value>>>13;value=Math.imul(value,1274126177);
  return(value>>>0)/4294967295;
}

function buildScene(selectedHex:string,items:readonly ColorSpatialItem[],quality:"high"|"balanced"|"lite"){
  const stride=8;
  const backgroundCount=quality==="high"?220:quality==="balanced"?150:90;
  const clusterCount=quality==="lite"?7:12;
  const values:number[]=[];
  const selected=hexToStudioRgb(selectedHex,[.8,.5,.5]);

  for(let i=0;i<backgroundCount;i+=1){
    const theta=seeded(i,2)*Math.PI*2;
    const phi=Math.acos(2*seeded(i,3)-1);
    const radius=4.7+seeded(i,4)*5.5;
    const tint=.35+seeded(i,5)*.45;
    values.push(
      Math.sin(phi)*Math.cos(theta)*radius,
      Math.cos(phi)*radius*.66,
      Math.sin(phi)*Math.sin(theta)*radius-1.4,
      selected[0]*tint+.18*(1-tint),
      selected[1]*tint+.18*(1-tint),
      selected[2]*tint+.18*(1-tint),
      2.1+seeded(i,6)*2.5,
      .12+seeded(i,7)*.18
    );
  }

  items.slice(0,clusterCount).forEach((item,index)=>{
    const color=hexToStudioRgb(item.colorHex,[.8,.5,.5]);
    const closeness=Math.max(0,Math.min(1,item.match/100));
    const angle=(index/Math.max(1,Math.min(items.length,clusterCount)))*Math.PI*2;
    const radius=1.35+(1-closeness)*3.4;
    const cx=Math.cos(angle)*radius;
    const cy=Math.sin(angle*1.7)*1.55;
    const cz=Math.sin(angle)*1.65-.25;
    const particles=quality==="lite"?7:11;

    for(let j=0;j<particles;j+=1){
      const spread=.18+(1-closeness)*.32;
      values.push(
        cx+(seeded(index*17+j,8)-.5)*spread,
        cy+(seeded(index*17+j,9)-.5)*spread,
        cz+(seeded(index*17+j,10)-.5)*spread,
        color[0],color[1],color[2],
        4.2+closeness*5.4,
        .42+closeness*.4
      );
    }
  });

  values.push(0,0,.15,selected[0],selected[1],selected[2],16,.96);
  return new Float32Array(values);
}

export function ColorSpatialUniverse({selectedHex,selectedLabel,studioLabel,items}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const frameRef=useRef<number|null>(null);
  const {qualityTier,reducedMotion}=useStudioRuntime();
  const visibleItems=useMemo(()=>items.slice(0,10),[items]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const host=canvas?.parentElement;
    if(!canvas||!host)return;
    const gl=canvas.getContext("webgl",{alpha:true,antialias:qualityTier!=="lite",depth:false,powerPreference:"high-performance"});
    if(!gl)return;

    let p:WebGLProgram|null=null;
    let buffer:WebGLBuffer|null=null;
    let observer:ResizeObserver|null=null;
    let disposed=false;

    try{
      const activeProgram=createStudioProgram(gl,VERTEX,FRAGMENT,"color_spatial");p=activeProgram;
      const scene=buildScene(selectedHex,visibleItems,qualityTier);
      const activeBuffer=gl.createBuffer();
      if(!activeBuffer)throw new Error("color_spatial_buffer_create_failed");
      buffer=activeBuffer;
      gl.bindBuffer(gl.ARRAY_BUFFER,activeBuffer);gl.bufferData(gl.ARRAY_BUFFER,scene,gl.STATIC_DRAW);
      gl.useProgram(activeProgram);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE);

      const stride=8*Float32Array.BYTES_PER_ELEMENT;
      const position=gl.getAttribLocation(activeProgram,"a_position");
      const color=gl.getAttribLocation(activeProgram,"a_color");
      const size=gl.getAttribLocation(activeProgram,"a_size");
      const alpha=gl.getAttribLocation(activeProgram,"a_alpha");
      gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,3,gl.FLOAT,false,stride,0);
      gl.enableVertexAttribArray(color);gl.vertexAttribPointer(color,3,gl.FLOAT,false,stride,3*Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(size);gl.vertexAttribPointer(size,1,gl.FLOAT,false,stride,6*Float32Array.BYTES_PER_ELEMENT);
      gl.enableVertexAttribArray(alpha);gl.vertexAttribPointer(alpha,1,gl.FLOAT,false,stride,7*Float32Array.BYTES_PER_ELEMENT);

      const yaw=gl.getUniformLocation(activeProgram,"u_yaw");
      const pitch=gl.getUniformLocation(activeProgram,"u_pitch");
      const camera=gl.getUniformLocation(activeProgram,"u_camera");
      const aspect=gl.getUniformLocation(activeProgram,"u_aspect");
      const dprLoc=gl.getUniformLocation(activeProgram,"u_dpr");
      const timeLoc=gl.getUniformLocation(activeProgram,"u_time");
      const dprCap=studioDprCap(qualityTier,{high:1.55,balanced:1.3,lite:1});

      const resize=()=>{ resizeStudioCanvas(canvas,host,gl,dprCap); };
      observer=new ResizeObserver(resize);observer.observe(host);resize();

      const render=(time:number)=>{
        if(disposed)return;
        const width=host.clientWidth,height=host.clientHeight;
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(activeProgram);
        gl.uniform1f(yaw,reducedMotion?-.06:-.06+Math.sin(time*.0002)*.055);
        gl.uniform1f(pitch,-.035);
        gl.uniform1f(camera,10.6);
        gl.uniform1f(aspect,width/Math.max(1,height));
        gl.uniform1f(dprLoc,Math.min(devicePixelRatio||1,dprCap));
        gl.uniform1f(timeLoc,time/1000);
        gl.drawArrays(gl.POINTS,0,scene.length/8);
        if(!reducedMotion)frameRef.current=requestAnimationFrame(render);
      };
      render(performance.now());
    }catch(error){console.error("[color-finder] spatial universe unavailable",error)}

    return()=>{
      disposed=true;observer?.disconnect();
      if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
      if(buffer)gl.deleteBuffer(buffer);if(p)gl.deleteProgram(p);
    };
  },[qualityTier,reducedMotion,selectedHex,visibleItems]);

  return(
    <div className={styles.universe}>
      <canvas ref={canvasRef} aria-hidden="true"/>
      <div className={styles.center} style={{"--selected-color":selectedHex} as CSSProperties} aria-hidden="true"><i/><span/></div>
      <div className={styles.productField} aria-label={`Κοντινότερα προϊόντα στο ${selectedLabel}`}>
        {visibleItems.map((item,index)=>{
          const angle=(index/Math.max(1,visibleItems.length))*Math.PI*2-Math.PI/2;
          const radius=18+(100-item.match)*.35;
          const x=50+Math.cos(angle)*Math.min(43,radius);
          const y=50+Math.sin(angle)*Math.min(37,radius*.84);
          return(
            <Link
              key={item.id}
              href={`/product/${encodeURIComponent(item.slug||item.id)}`}
              className={styles.productNode}
              style={{left:`${x}%`,top:`${y}%`}}
              title={`${item.title} · ${item.match}% match`}
            >
              <span style={{"--node-color":item.colorHex} as CSSProperties}>
                <img src={item.imageSrc} alt="" loading="lazy" decoding="async"/>
              </span>
              <b>{item.match}%</b>
            </Link>
          );
        })}
      </div>
      <div className={styles.caption}>
        <span>{studioLabel}</span>
        <strong>{selectedLabel}</strong>
        <small>{visibleItems.length ? `${visibleItems.length} closest products orbiting the selected colour` : "Το πεδίο θα γεμίσει μόλις φορτώσει ο κατάλογος."}</small>
      </div>
    </div>
  );
}
