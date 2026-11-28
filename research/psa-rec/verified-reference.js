
import {enrollReferencePatches,openReferencePatches} from './compact-reference.js';
const FORMAT='talus-reference-envelope-v2',SAMPLER='cpas-spatial-41-v1';
const validId=x=>typeof x==='string'&&x.length>0&&x.length<=256;
const validRevision=x=>Number.isSafeInteger(x)&&x>=1;
const finiteMatrix=m=>Array.isArray(m)&&m.length===9&&Array.from(m).every(Number.isFinite)&&Math.abs(m[0]*(m[4]*m[8]-m[5]*m[7])-m[1]*(m[3]*m[8]-m[5]*m[6])+m[2]*(m[3]*m[7]-m[4]*m[6]))>1e-12;
function poseBinding(registration){
 if(registration?.status!=='registered'||!finiteMatrix(registration.pageToSource))throw Error('Invalid registered pose');
 const blocks=registration.refinedBlocks??[];
 if(!Array.isArray(blocks)||new Set(blocks.map(b=>b.id)).size!==blocks.length||blocks.some(b=>!validId(b.id)||!finiteMatrix(b.matrix)))throw Error('Invalid block poses');
 return JSON.stringify([registration.pageToSource,blocks.map(b=>[b.id,b.matrix])]);
}
// CRC-32 detects accidental corruption, not malicious modification or authentication.
function checksum(e){
 let c=0xffffffff;const byte=b=>{c^=b;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0)};
 const text=JSON.stringify([e.format,e.sampler,e.referenceId,e.referenceRevision,e.pose,e.payload.format,e.payload.binding,e.payload.count,e.payload.reasons]);
 for(let i=0;i<text.length;i++){const x=text.charCodeAt(i);byte(x&255);byte(x>>>8)}
 for(const b of e.payload.pixels)byte(b);for(const b of e.payload.usable)byte(b);
 return (c^0xffffffff)>>>0;
}
export function enrollVerifiedReference(gray,profile,registration,{referenceId,referenceRevision,confirmedBlank=false}={}){
 if(!validId(referenceId)||!validRevision(referenceRevision)||confirmedBlank!==true)throw Error('Explicit reference identity and teacher confirmation required');
 const pose=poseBinding(registration),payload=enrollReferencePatches(gray,profile,registration,{confirmedBlank});
 const e={format:FORMAT,sampler:SAMPLER,referenceId,referenceRevision,pose,payload};
 return {...e,checksum:checksum(e)};
}
export function openVerifiedReference(e,profile,{referenceId,referenceRevision}={}){
 if(!e||e.format!==FORMAT||e.sampler!==SAMPLER||!validId(referenceId)||!validRevision(referenceRevision)||e.referenceId!==referenceId||e.referenceRevision!==referenceRevision||typeof e.pose!=='string'||!e.payload||!(e.payload.pixels instanceof Uint8Array)||!(e.payload.usable instanceof Uint8Array)||e.payload.pixels.length>1200*1681||e.payload.usable.length>1200||!Number.isInteger(e.checksum)||checksum(e)!==e.checksum)throw Error('Reference identity, format or integrity failure');
 return openReferencePatches(e.payload,profile);
}
