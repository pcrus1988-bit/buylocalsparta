"use client";

import { useEffect, useMemo, useRef } from "react";
import { useStudioRuntime } from "./StudioExperienceRuntime";
import styles from "./StyleSpatialScene.module.css";

export type StyleSpatialItem = Readonly<{
  slot: string;
  label: string;
  title: string;
  imageSrc?: string;
}>;

type Props = Readonly<{
  audience: "women" | "men";
  items: readonly StyleSpatialItem[];
  activeSlot?: string | null;
  onSelect?: (slot: string) => void;
}>;

const VERTEX = `
precision highp float;
attribute vec4 a_vertex;
uniform float u_yaw;
uniform float u_pitch;
uniform float u_camera;
uniform float u_aspect;
uniform float u_dpr;
uniform float u_time;
uniform float u_active;
varying float v_kind;
varying float v_index;
varying float v_depth;

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
  float kind=floor(a_vertex.w);
  float index=fract(a_vertex.w)*10.0;
  float focus=1.0-step(.42,abs(index-u_active));
  gl_PointSize=clamp(mix(3.0,8.0+focus*5.0,step(1.5,kind))*(9.0/depth)*u_dpr,1.0,13.0*u_dpr);
  v_kind=kind;
  v_index=index;
  v_depth=depth;
}
`;

const FRAGMENT = `
precision mediump float;
uniform float u_time;
uniform float u_active;
varying float v_kind;
varying float v_index;
varying float v_depth;

void main(){
  vec3 ivory=vec3(.94,.88,.78);
  vec3 champagne=vec3(.79,.65,.48);
  vec3 dim=vec3(.34,.31,.28);
  float focus=1.0-step(.42,abs(v_index-u_active));
  vec3 color=v_kind<.5?dim:(v_kind<1.5?ivory:mix(champagne,ivory,focus));
  float alpha=v_kind<.5?.16:(v_kind<1.5?.5:.62+focus*.28);
  if(v_kind>1.5){
    vec2 q=gl_PointCoord-vec2(.5);
    if(dot(q,q)>.25) discard;
    alpha*=.78+.22*sin(u_time*1.5+v_depth+v_index);
  }
  gl_FragColor=vec4(color,alpha);
}
`;

function compile(gl:WebGLRenderingContext,type:number,source:string){
  const s=gl.createShader(type);
  if(!s)throw new Error("style_shader_create_failed");
  gl.shaderSource(s,source);gl.compileShader(s);
  if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){
    const message=gl.getShaderInfoLog(s)||"style_shader_compile_failed";
    gl.deleteShader(s);throw new Error(message);
  }
  return s;
}

function createProgram(gl:WebGLRenderingContext){
  const p=gl.createProgram();
  if(!p)throw new Error("style_program_create_failed");
  const vs=compile(gl,gl.VERTEX_SHADER,VERTEX);
  const fs=compile(gl,gl.FRAGMENT_SHADER,FRAGMENT);
  gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p);
  gl.deleteShader(vs);gl.deleteShader(fs);
  if(!gl.getProgramParameter(p,gl.LINK_STATUS)){
    const message=gl.getProgramInfoLog(p)||"style_program_link_failed";
    gl.deleteProgram(p);throw new Error(message);
  }
  return p;
}

type V=readonly [number,number,number,number];
function line(out:V[],a:readonly[number,number,number],b:readonly[number,number,number],kind=0,index=0){
  const w=kind+index/10;
  out.push([a[0],a[1],a[2],w],[b[0],b[1],b[2],w]);
}
function circle(out:V[],cx:number,cy:number,cz:number,r:number,axis:"xy"|"xz",kind=0){
  const steps=44;
  for(let i=0;i<steps;i+=1){
    const a=(i/steps)*Math.PI*2;
    const b=((i+1)/steps)*Math.PI*2;
    if(axis==="xy")line(out,[cx+Math.cos(a)*r,cy+Math.sin(a)*r,cz],[cx+Math.cos(b)*r,cy+Math.sin(b)*r,cz],kind);
    else line(out,[cx+Math.cos(a)*r,cy,cz+Math.sin(a)*r],[cx+Math.cos(b)*r,cy,cz+Math.sin(b)*r],kind);
  }
}

function sceneGeometry(audience:"women"|"men",count:number){
  const lines:V[]=[];
  const points:V[]=[];
  const shoulder=audience==="women"?1.18:1.4;
  const hip=audience==="women"?1.0:.9;

  circle(lines,0,2.55,0,.48,"xy",1);
  line(lines,[0,2.05,0],[0,-1.65,0],1);
  line(lines,[-shoulder,1.45,0],[shoulder,1.45,0],1);
  line(lines,[-shoulder,1.45,0],[-1.65,.05,.05],1);
  line(lines,[shoulder,1.45,0],[1.65,.05,.05],1);
  line(lines,[-hip,-.25,0],[hip,-.25,0],1);
  line(lines,[-hip,-.25,0],[-.72,-2.55,.05],1);
  line(lines,[hip,-.25,0],[.72,-2.55,.05],1);
  line(lines,[-.72,-2.55,.05],[-.75,-3.2,.48],1);
  line(lines,[.72,-2.55,.05],[.75,-3.2,.48],1);

  circle(lines,0,.3,-.55,3.25,"xz",0);
  circle(lines,0,.3,-.55,4.15,"xz",0);
  circle(lines,0,.3,-.55,5.0,"xz",0);

  for(let i=0;i<Math.max(6,count);i+=1){
    const angle=(i/Math.max(6,count))*Math.PI*2-.5;
    const radius=3.2+(i%2)*.55;
    points.push([Math.cos(angle)*radius,.45+Math.sin(angle*1.7)*2.0,Math.sin(angle)*1.9-.4,2+i/10]);
  }
  for(let i=0;i<54;i+=1){
    const a=(i/54)*Math.PI*2;
    points.push([Math.cos(a)*(4.8+(i%5)*.22),Math.sin(a*1.4)*2.8,Math.sin(a)*2.2-1.2,2.9]);
  }
  return{lines:new Float32Array(lines.flat()),points:new Float32Array(points.flat())};
}

export function StyleSpatialScene({audience,items,activeSlot,onSelect}:Props){
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const frameRef=useRef<number|null>(null);
  const {qualityTier,reducedMotion}=useStudioRuntime();
  const visibleItems=useMemo(()=>items.slice(0,8),[items]);
  const activeIndex=Math.max(0,visibleItems.findIndex(item=>item.slot===activeSlot));

  useEffect(()=>{
    const canvas=canvasRef.current;
    const host=canvas?.parentElement;
    if(!canvas||!host)return;
    const gl=canvas.getContext("webgl",{alpha:true,antialias:qualityTier!=="lite",depth:false,powerPreference:"high-performance"});
    if(!gl)return;

    let p:WebGLProgram|null=null;
    let lineBuffer:WebGLBuffer|null=null;
    let pointBuffer:WebGLBuffer|null=null;
    let observer:ResizeObserver|null=null;
    let disposed=false;

    try{
      const activeProgram=createProgram(gl);p=activeProgram;
      const geometry=sceneGeometry(audience,visibleItems.length);
      const lb=gl.createBuffer();const pb=gl.createBuffer();
      if(!lb||!pb)throw new Error("style_buffer_create_failed");
      lineBuffer=lb;pointBuffer=pb;
      gl.useProgram(activeProgram);
      gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);

      const vertex=gl.getAttribLocation(activeProgram,"a_vertex");
      const yaw=gl.getUniformLocation(activeProgram,"u_yaw");
      const pitch=gl.getUniformLocation(activeProgram,"u_pitch");
      const camera=gl.getUniformLocation(activeProgram,"u_camera");
      const aspect=gl.getUniformLocation(activeProgram,"u_aspect");
      const dprLoc=gl.getUniformLocation(activeProgram,"u_dpr");
      const timeLoc=gl.getUniformLocation(activeProgram,"u_time");
      const activeLoc=gl.getUniformLocation(activeProgram,"u_active");
      const dprCap=qualityTier==="high"?1.6:qualityTier==="balanced"?1.35:1;

      gl.bindBuffer(gl.ARRAY_BUFFER,lb);gl.bufferData(gl.ARRAY_BUFFER,geometry.lines,gl.STATIC_DRAW);
      gl.bindBuffer(gl.ARRAY_BUFFER,pb);gl.bufferData(gl.ARRAY_BUFFER,geometry.points,gl.STATIC_DRAW);

      const resize=()=>{
        const rect=host.getBoundingClientRect();
        const dpr=Math.min(devicePixelRatio||1,dprCap);
        canvas.width=Math.max(1,Math.floor(rect.width*dpr));
        canvas.height=Math.max(1,Math.floor(rect.height*dpr));
        canvas.style.width=`${rect.width}px`;canvas.style.height=`${rect.height}px`;
        gl.viewport(0,0,canvas.width,canvas.height);
      };
      observer=new ResizeObserver(resize);observer.observe(host);resize();

      const bind=(b:WebGLBuffer)=>{
        gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.enableVertexAttribArray(vertex);
        gl.vertexAttribPointer(vertex,4,gl.FLOAT,false,0,0);
      };
      const render=(time:number)=>{
        if(disposed)return;
        const width=host.clientWidth,height=host.clientHeight;
        gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(activeProgram);
        gl.uniform1f(yaw,reducedMotion?-.08:-.08+Math.sin(time*.00022)*.05);
        gl.uniform1f(pitch,-.035);
        gl.uniform1f(camera,10.8);
        gl.uniform1f(aspect,width/Math.max(1,height));
        gl.uniform1f(dprLoc,Math.min(devicePixelRatio||1,dprCap));
        gl.uniform1f(timeLoc,time/1000);
        gl.uniform1f(activeLoc,activeSlot?activeIndex:-10);
        bind(lb);gl.drawArrays(gl.LINES,0,geometry.lines.length/4);
        bind(pb);gl.drawArrays(gl.POINTS,0,geometry.points.length/4);
        if(!reducedMotion)frameRef.current=requestAnimationFrame(render);
      };
      render(performance.now());
    }catch(error){console.error("[style] spatial scene unavailable",error)}

    return()=>{
      disposed=true;observer?.disconnect();
      if(frameRef.current!==null)cancelAnimationFrame(frameRef.current);
      if(lineBuffer)gl.deleteBuffer(lineBuffer);if(pointBuffer)gl.deleteBuffer(pointBuffer);if(p)gl.deleteProgram(p);
    };
  },[activeIndex,activeSlot,audience,qualityTier,reducedMotion,visibleItems.length]);

  return(
    <div className={styles.scene} data-count={visibleItems.length}>
      <canvas ref={canvasRef} aria-hidden="true"/>
      <div className={styles.orbit} aria-label="Τα κομμάτια του ενεργού look σε τρισδιάστατη διάταξη">
        {visibleItems.map((item,index)=>{
          const angle=((index/Math.max(visibleItems.length,1))*Math.PI*2)-Math.PI/2;
          const x=50+Math.cos(angle)*38;
          const y=50+Math.sin(angle)*32;
          const scale=.78+(Math.sin(angle)+1)*.11;
          return(
            <button
              type="button"
              key={item.slot}
              className={styles.orbitItem}
              data-active={activeSlot===item.slot||undefined}
              style={{left:`${x}%`,top:`${y}%`,transform:`translate(-50%,-50%) scale(${scale})`}}
              onClick={()=>onSelect?.(item.slot)}
              aria-label={`Αλλαγή ${item.label}: ${item.title}`}
            >
              <span>
                {item.imageSrc?<img src={item.imageSrc} alt="" loading="lazy" decoding="async"/>:<b>{item.label.slice(0,2).toUpperCase()}</b>}
              </span>
              <small>{item.label}</small>
            </button>
          );
        })}
      </div>
      <div className={styles.stageLabel}><span>LIVE LOOK</span><strong>{visibleItems.length} PIECES</strong></div>
    </div>
  );
}
