"use client";

import { useEffect, useMemo, useRef } from "react";
import { createStudioProgram, resizeStudioCanvas, studioDprCap } from "../lib/studio-webgl";
import { useStudioRuntime } from "./StudioExperienceRuntime";
import styles from "./StyleShowroomScene.module.css";

export type StyleShowroomItem = Readonly<{
  slot: string;
  label: string;
  title: string;
  imageSrc?: string;
}>;

type Props = Readonly<{
  audience: "women" | "men";
  items: readonly StyleShowroomItem[];
  activeSlot?: string | null;
  onSelect?: (slot: string) => void;
}>;

type V = readonly [number, number, number, number];

const VERTEX = `
precision highp float;
attribute vec4 a_vertex;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
uniform float u_dpr;
varying float v_kind;

void main(){
  float cy=cos(u_yaw);
  float sy=sin(u_yaw);
  float cx=cos(u_pitch);
  float sx=sin(u_pitch);
  vec3 p=a_vertex.xyz;
  p=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
  p=vec3(p.x,cx*p.y-sx*p.z,sx*p.y+cx*p.z);
  float depth=max(1.2,u_camera-p.z);
  float f=1.82;
  gl_Position=vec4((p.x*f/max(u_aspect,.62))/depth,(p.y*f)/depth,clamp((depth-1.0)/28.0*2.0-1.0,-1.0,1.0),1.0);
  gl_PointSize=clamp((a_vertex.w>2.5?6.0:3.0)*(9.0/depth)*u_dpr,1.0,8.0*u_dpr);
  v_kind=a_vertex.w;
}
`;

const FRAGMENT = `
precision mediump float;
varying float v_kind;
void main(){
  vec3 room=vec3(.28,.25,.23);
  vec3 brass=vec3(.76,.64,.48);
  vec3 ivory=vec3(.94,.89,.82);
  vec3 color=v_kind<.5?room:(v_kind<1.5?brass:ivory);
  float alpha=v_kind<.5?.28:(v_kind<1.5?.62:.86);
  if(v_kind>2.5){
    vec2 q=gl_PointCoord-vec2(.5);
    if(dot(q,q)>.25) discard;
  }
  gl_FragColor=vec4(color,alpha);
}
`;

function line(out: V[], a: readonly [number,number,number], b: readonly [number,number,number], kind=0){
  out.push([a[0],a[1],a[2],kind],[b[0],b[1],b[2],kind]);
}

function rect(out: V[], x1:number,y1:number,x2:number,y2:number,z:number,kind=0){
  line(out,[x1,y1,z],[x2,y1,z],kind);
  line(out,[x2,y1,z],[x2,y2,z],kind);
  line(out,[x2,y2,z],[x1,y2,z],kind);
  line(out,[x1,y2,z],[x1,y1,z],kind);
}

function geometry(audience:"women"|"men"){
  const lines:V[]=[];
  const lights:V[]=[];

  // Runway floor and perspective seams.
  line(lines,[-6.8,-2.8,-5.6],[-3.1,-2.8,4.5],0);
  line(lines,[6.8,-2.8,-5.6],[3.1,-2.8,4.5],0);
  for(let z=-5.2;z<=4.2;z+=1.15){
    const width=3.2+(z+5.2)*.35;
    line(lines,[-width,-2.8,z],[width,-2.8,z],0);
  }

  // Back wall, mirror and side wardrobe rails.
  rect(lines,-5.5,-2.4,5.5,3.9,-5.2,0);
  rect(lines,-1.55,-1.85,1.55,3.25,-5.0,2);
  line(lines,[-4.9,2.6,-4.6],[-2.55,2.6,-4.6],1);
  line(lines,[2.55,2.6,-4.6],[4.9,2.6,-4.6],1);
  line(lines,[-4.55,-1.8,-4.6],[-4.55,2.6,-4.6],1);
  line(lines,[4.55,-1.8,-4.6],[4.55,2.6,-4.6],1);

  // Central mannequin silhouette.
  const shoulder=audience==="women"?1.08:1.3;
  const hip=audience==="women"?.92:.82;
  rect(lines,-.26,2.15,.26,2.85,-3.65,2);
  line(lines,[0,2.15,-3.65],[0,-1.05,-3.65],2);
  line(lines,[-shoulder,1.35,-3.65],[shoulder,1.35,-3.65],2);
  line(lines,[-shoulder,1.35,-3.65],[-1.48,.1,-3.65],2);
  line(lines,[shoulder,1.35,-3.65],[1.48,.1,-3.65],2);
  line(lines,[-hip,-.2,-3.65],[hip,-.2,-3.65],2);
  line(lines,[-hip,-.2,-3.65],[-.58,-2.25,-3.65],2);
  line(lines,[hip,-.2,-3.65],[.58,-2.25,-3.65],2);

  // Fitting-room spot lights.
  for(let i=-2;i<=2;i+=1) lights.push([i*1.65,3.5,-3.0,3]);

  return {
    lines:new Float32Array(lines.flat()),
    lights:new Float32Array(lights.flat())
  };
}

export function StyleShowroomScene({audience,items,activeSlot,onSelect}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const frameRef=useRef<number|null>(null);
  const {qualityTier,reducedMotion}=useStudioRuntime();
  const visibleItems=useMemo(()=>items.slice(0,8),[items]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    const host=canvas?.parentElement;
    if(!canvas||!host)return;
    const gl=canvas.getContext("webgl",{alpha:true,antialias:qualityTier!=="lite",depth:false,powerPreference:"high-performance"});
    if(!gl)return;

    let p:WebGLProgram|null=null;
    let lineBuffer:WebGLBuffer|null=null;
    let lightBuffer:WebGLBuffer|null=null;
    let observer:ResizeObserver|null=null;
    let disposed=false;

    try{
      const activeProgram=createStudioProgram(gl,VERTEX,FRAGMENT,"style_showroom");
      p=activeProgram;
      const scene=geometry(audience);
      const lb=gl.createBuffer(), pb=gl.createBuffer();
      if(!lb||!pb)throw new Error("style_showroom_buffer_create_failed");
      lineBuffer=lb;lightBuffer=pb;

      gl.useProgram(activeProgram);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

      const vertex=gl.getAttribLocation(activeProgram,"a_vertex");
      const yaw=gl.getUniformLocation(activeProgram,"u_yaw");
      const pitch=gl.getUniformLocation(activeProgram,"u_pitch");
      const camera=gl.getUniformLocation(activeProgram,"u_camera");
      const aspect=gl.getUniformLocation(activeProgram,"u_aspect");
      const dprLoc=gl.getUniformLocation(activeProgram,"u_dpr");
      const dprCap=studioDprCap(qualityTier);

      gl.bindBuffer(gl.ARRAY_BUFFER,lb);
      gl.bufferData(gl.ARRAY_BUFFER,scene.lines,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,pb);
      gl.bufferData(gl.ARRAY_BUFFER,scene.lights,gl.STATIC_DRAW);

      const resize=()=>{resizeStudioCanvas(canvas,host,gl,dprCap);};
      observer=new ResizeObserver(resize);observer.observe(host);resize();

      const bind=(buffer:WebGLBuffer)=>{
        gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
        gl.enableVertexAttribArray(vertex);
        gl.vertexAttribPointer(vertex,4,gl.FLOAT,false,0,0);
      };

      const render=(time:number)=>{
        if(disposed)return;
        const width=host.clientWidth,height=host.clientHeight;
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(activeProgram);
        gl.uniform1f(yaw,reducedMotion?-.02:-.02+Math.sin(time*.00018)*.018);
        gl.uniform1f(pitch,-.04);
        gl.uniform1f(camera,10.7);
        gl.uniform1f(aspect,width/Math.max(1,height));
        gl.uniform1f(dprLoc,Math.min(devicePixelRatio||1,dprCap));
        bind(lb);gl.drawArrays(gl.LINES,0,scene.lines.length/4);
        bind(pb);gl.drawArrays(gl.POINTS,0,scene.lights.length/4);
        if(!reducedMotion)frameRef.current=requestAnimationFrame(render);
      };
      render(performance.now());
    }catch(error){console.error("[style] showroom scene unavailable",error);}

    return()=>{
      disposed=true;observer?.disconnect();
      if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
      if(lineBuffer)gl.deleteBuffer(lineBuffer);
      if(lightBuffer)gl.deleteBuffer(lightBuffer);
      if(p)gl.deleteProgram(p);
    };
  },[audience,qualityTier,reducedMotion]);

  return(
    <div className={styles.showroom} data-count={visibleItems.length}>
      <canvas ref={canvasRef} aria-hidden="true"/>
      <div className={styles.runwayGlow} aria-hidden="true"/>
      <div className={styles.rack} aria-label="Τα κομμάτια του ενεργού look στο fitting room">
        {visibleItems.map((item,index)=>{
          const side=index%2===0?"left":"right";
          const row=Math.floor(index/2);
          return(
            <button
              type="button"
              key={item.slot}
              className={styles.garmentCard}
              data-side={side}
              data-row={row}
              data-active={activeSlot===item.slot||undefined}
              onClick={()=>onSelect?.(item.slot)}
              aria-label={`Αλλαγή ${item.label}: ${item.title}`}
            >
              <span className={styles.hanger} aria-hidden="true"/>
              <div className={styles.garmentImage}>
                {item.imageSrc?<img src={item.imageSrc} alt="" loading="lazy" decoding="async"/>:<b>{item.label.slice(0,2).toUpperCase()}</b>}
              </div>
              <small>{item.label}</small>
            </button>
          );
        })}
      </div>
      <div className={styles.stageLabel}>
        <span>FITTING ROOM</span>
        <strong>{visibleItems.length ? `${visibleItems.length} PIECES ON THE RACK` : "PRIVATE SHOWROOM"}</strong>
      </div>
    </div>
  );
}
