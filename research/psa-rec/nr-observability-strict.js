
import { grayAt } from '../../app/src/omr-image.js';
import { refineSlot } from './nr-local-pose.js';
const angles=Array.from({length:24},(_,i)=>i*Math.PI/12).filter(a=>Math.abs(Math.cos(a))>.42);
const median=a=>{const s=[...a].sort((a,b)=>a-b);return (s[(s.length-1)>>1]+s[s.length>>1])/2};
// R10 audit: assess individual ring consistency at the R9 candidate (or original) pose.
// No mark prediction, answer key, compatibility override or automatic grading.
export function observeSlot(gray,reg,choices){
 const correction=refineSlot(gray,reg,choices);
 if(reg.status!=='registered')return {state:'registration-rejected',correction};
 if(!['proposed','no-supported-change'].includes(correction.status))return {state:'unreliable',correction};
 const m=correction.matrix??reg.pageToSource;
 const r=median(choices.map(b=>b.radius));
 const sample=(x,y)=>{const w=m[6]*x+m[7]*y+m[8];return grayAt(gray,(m[0]*x+m[1]*y+m[2])/w,(m[3]*x+m[4]*y+m[5])/w)};
 function score(b,u,v){
  const ds=angles.map(a=>{const at=t=>sample(b.x+(u+t*Math.cos(a))*b.radius,b.y+(v+t*Math.sin(a))*b.radius);
   return (at(1.27)-(at(.96)+at(1.04))/2)/255;});
  return ds.every(Number.isFinite)?median(ds):NaN;
 }
 const sites=choices.map(b=>{
  let best={u:0,v:0,value:score(b,0,0)},origin=best.value;
  if(!Number.isFinite(origin))return {supported:false};
  for(let i=-4;i<=4;i++)for(let j=-4;j<=4;j++){
   const u=i*.08,v=j*.08,value=score(b,u,v);
   if(Number.isFinite(value)&&value>best.value)best={u,v,value};
  }
  // Allow raster-phase ambiguity when origin nearly as good as maximum.
  const displaced=Math.hypot(best.u,best.v)>.16&&best.value-origin>.035;
  return {supported:origin>=.10&&!displaced,origin,...best,displaced};
 });
 const supported=sites.filter(x=>x.supported).length;
 // R10 correction: require every mapped ring; a single shifted choice matters.
 const state=supported===choices.length?(correction.status==='proposed'?'supported-correction':'supported-original'):'unreliable';
 return {state,correction,sites,supported,total:choices.length,matrix:state==='unreliable'?null:m};
}
