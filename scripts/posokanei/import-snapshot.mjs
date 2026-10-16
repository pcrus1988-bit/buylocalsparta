#!/usr/bin/env node
/** Manually download/read a PUBLIC daily mirror. Does not hit protected government API. */
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {transformSnapshot,sha256,asJsonl} from './snapshot-adapter.mjs';
const BASE='https://raw.githubusercontent.com/spyrosavl/posokanei/main/';
const MAX=100*1024*1024;
const arg=flag=>{const n=process.argv.indexOf(flag);return n<0?null:process.argv[n+1]};
async function jsonFromUrl(url,maxBytes=MAX){
  const res=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(60000)});
  if(!res.ok)throw Error('Public mirror returned '+res.status+' for '+url);
  if(Number(res.headers.get('content-length')||0)>maxBytes)throw Error('Archive too large');
  const chunks=[];let size=0;
  for await(const part of res.body){
    size+=part.byteLength;
    if(size>maxBytes)throw Error('Archive too large');
    chunks.push(Buffer.from(part));
  }
  const raw=Buffer.concat(chunks);
  return {raw,data:JSON.parse(raw.toString('utf8'))};
}
async function main(){
  const latest=process.argv.includes('--latest'),input=arg('--input'),out=arg('--out');
  if((latest===Boolean(input))||!out){
    console.log('Usage: node scripts/posokanei/import-snapshot.mjs (--latest | --input FILE) --out DIR');
    process.exitCode=2;return;
  }
  let raw,data,origin;
  if(latest){
    const index=(await jsonFromUrl(BASE+'data/latest.json',20000)).data;
    if(!index||typeof index.date!=='string'||! /^data\/\d{4}\/posokanei-\d{4}-\d{2}-\d{2}\.json$/.test(index.path)||index.path!=='data/'+index.date.slice(0,4)+'/posokanei-'+index.date+'.json'||index.total!==index.collected){
      throw Error('Archive pointer invalid or incomplete');
    }
    origin=BASE+index.path;
    ({raw,data}=await jsonFromUrl(origin));
    if(data.date!==index.date||data.total!==index.total||data.collected!==index.collected)throw Error('Archive differs from index');
  }else{
    origin=resolve(input);raw=await readFile(origin);
    if(raw.byteLength>MAX)throw Error('Archive too large');
    data=JSON.parse(raw.toString('utf8'));
  }
  const result=transformSnapshot(data);
  const dir=resolve(out);
  await mkdir(dir,{recursive:true});
  const manifest={...result.manifest,snapshot_sha256:sha256(raw),source_url_or_path:origin};
  await Promise.all([
    writeFile(join(dir,'manifest.json'),JSON.stringify(manifest,null,2)+'\n'),
    writeFile(join(dir,'reference-products.jsonl'),asJsonl(result.references)),
    writeFile(join(dir,'reference-prices.jsonl'),asJsonl(result.prices))
  ]);
  console.log(JSON.stringify({dir,date:manifest.snapshot_date,products:result.references.length,prices:result.prices.length,warnings:manifest.warnings},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1});
