import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const [root,...manifests]=process.argv.slice(2);
const source=(filename)=>import(pathToFileURL(resolve(root,'src',filename)).href);
const {readProfileSheet}=await source('profile-omr.js');
const {project}=await source('projective.js');
function decode(path) {
  const b=execFileSync('python3',['-c',"from PIL import Image;import sys,struct;im=Image.open(sys.argv[1]).convert('RGBA');sys.stdout.buffer.write(struct.pack('!II',*im.size)+im.tobytes())",path],{maxBuffer:2400**2*4+8});
  return {id:path,width:b.readUInt32BE(0),height:b.readUInt32BE(4),pixels:new Uint8ClampedArray(b.buffer,b.byteOffset+8,b.length-8)};
}
function percentile(array,fraction) {
  const sorted=[...array].sort((a,b)=>a-b);
  return sorted.length ? Number(sorted[Math.ceil(sorted.length*fraction)-1].toFixed(3)) : null;
}
function errorsFor(result,profile,fixture) {
  const {pageToSource,refinedBlocks}=result.registration;
  if(!pageToSource || !fixture.centers)return [];
  return profile.components.flatMap((block,index)=>block.items.flatMap(i=>i.choices.map(c=>{
    const transform = refinedBlocks?.find(b=>b.id===block.id)?.matrix ?? pageToSource;
    const p=project(transform,c.x,c.y), e=fixture.centers[i.id+':'+c.symbol];
    if (!e) throw new Error('Incomplete synthetic center oracle');
    const q=project(transform,c.x+c.radius,c.y);
    return Math.hypot(e.x-p.x,e.y-p.y)/Math.hypot(q.x-p.x,q.y-p.y);
  })));
}
for(const manifestPath of manifests) {
  const manifest=JSON.parse(await readFile(resolve(manifestPath),'utf8'));
  const profile={...manifest.profile,scope:'mc-only',mcCompleteness:'complete'};
  const batch={profileId:profile.id,revision:profile.revision};
  for(const fixture of manifest.cases) {
    if(/changed-code|unreadable-code|no-confirmation|wrong-confirmation/.test(fixture.name)) continue;
    const input=decode(resolve(dirname(manifestPath),fixture.image));
    for(const manual of [false,true]) {
      const t=performance.now();
      const result=readProfileSheet(input,profile,{batch,...(manual?{corners:fixture.scanCorners}:{})});
      const ms=Number((performance.now()-t).toFixed(1));
      const accepted=result.items.filter(i=>!i.review);
      const correct=fixture.valid?accepted.filter(i=>(i.rawText??null)===fixture.answers[i.id]).length:0;
      const wrong=fixture.valid?accepted.length-correct:accepted.length;
      const errors=errorsFor(result,profile,fixture);
      console.log(JSON.stringify({
       manifest:manifestPath,fixture:fixture.name,valid:fixture.valid,manual,status:result.status,path:result.registration.cornerPath,
       reasons:result.registration.reasons,expected:Object.keys(fixture.answers??{}).length,
       correct,wrong,review:result.items.length-accepted.length,ms,p95:percentile(errors,.95),
       errorSamples:errors,stageKeys:Object.keys(result.registration.diagnostics??{}),
       refined:result.registration.refinedBlocks, stationary:result.registration.stationary,
       blockSupport:result.registration.geometry?.blocks?.map(({supported,checked,missingRows,extraRows,missingColumns,spacingMismatch})=>
          ({supported,checked,missingRows,extraRows,missingColumns,spacingMismatch})),
      }));
    }
  }
}
