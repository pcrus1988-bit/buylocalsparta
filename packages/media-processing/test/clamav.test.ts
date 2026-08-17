import test from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { ClamAvScanner } from "../src/index.ts";

async function withFakeClamd(reply:string,run:(port:number,received:()=>Buffer)=>Promise<void>){let bytes=Buffer.alloc(0);const server=net.createServer(socket=>{socket.on("data",chunk=>{bytes=Buffer.concat([bytes,Buffer.from(chunk)]);if(bytes.includes(Buffer.alloc(4))&&bytes.length>=14){const last=bytes.subarray(-4);if(last.equals(Buffer.alloc(4))){socket.end(Buffer.from(`${reply}\0`))}}})});await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));const address=server.address();if(!address||typeof address==="string")throw new Error("fake clamd did not bind");try{await run(address.port,()=>bytes)}finally{await new Promise<void>(resolve=>server.close(()=>resolve()))}}

test("ClamAV INSTREAM uses framed chunks and recognizes clean response",async()=>{await withFakeClamd("stream: OK",async(port,received)=>{const scanner=new ClamAvScanner({host:"127.0.0.1",port,timeoutMs:2000,maxBytes:1024});async function* body(){yield Buffer.from("abc")};const result=await scanner.scan(body());assert.equal(result.status,"clean");const sent=received();assert.equal(sent.subarray(0,10).toString("utf8"),"zINSTREAM\0");assert.equal(sent.readUInt32BE(10),3);assert.equal(sent.subarray(14,17).toString("utf8"),"abc");assert.equal(sent.readUInt32BE(17),0)})});

test("ClamAV INSTREAM reports malware signature",async()=>{await withFakeClamd("stream: Eicar-Signature FOUND",async(port)=>{const scanner=new ClamAvScanner({host:"127.0.0.1",port,timeoutMs:2000,maxBytes:1024});async function* body(){yield Buffer.from("test")};const result=await scanner.scan(body());assert.equal(result.status,"infected");assert.equal(result.signature,"Eicar-Signature")})});
