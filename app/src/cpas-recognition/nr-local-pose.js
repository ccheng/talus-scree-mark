
import { grayAt } from '../omr-image.js';
export function translate(m,dx,dy){return [m[0],m[1],m[2]+m[0]*dx+m[1]*dy,m[3],m[4],m[5]+m[3]*dx+m[4]*dy,m[6],m[7],m[8]+m[6]*dx+m[7]*dy]}
const med=a=>{const s=[...a].sort((a,b)=>a-b);return (s[(s.length-1)>>1]+s[s.length>>1])/2};
const angles=Array.from({length:24},(_,i)=>[Math.cos(i*Math.PI/12),Math.sin(i*Math.PI/12)]).filter(([x])=>Math.abs(x)>.4);
// Research-only common translation per vertical NR slot. Exterior ring contrast; no glyph core, answer key or mark prediction.
export function refineSlot(gray,registration,choices){
 if(registration.status!=='registered')return {status:'registration-rejected'};
 const m=registration.matrix??registration.pageToSource;
 if(!m||m.length!==9||!m.every(Number.isFinite)||choices.length<8||choices.length>12||choices.some(b=>![b.x,b.y,b.radius].every(Number.isFinite)||b.radius<=0))return {status:'invalid'};
 const r=med(choices.map(b=>b.radius));
 const project=(x,y)=>{const w=m[6]*x+m[7]*y+m[8];return Math.abs(w)>1e-12?[(m[0]*x+m[1]*y+m[2])/w,(m[3]*x+m[4]*y+m[5])/w]:[NaN,NaN]};
 const sample=(x,y)=>grayAt(gray,...project(x,y));
 const p=choices[Math.floor(choices.length/2)],q=project(p.x,p.y),a=project(p.x+r,p.y),b=project(p.x,p.y+r);
 const resolution=Math.min(Math.hypot(a[0]-q[0],a[1]-q[1]),Math.hypot(b[0]-q[0],b[1]-q[1]));
 if(!Number.isFinite(resolution)||resolution<3.5)return {status:'undersampled'};
 function score(g,u,v){
  const rings=g.map(b=>{const d=angles.map(([x,y])=>{const at=t=>sample(b.x+u*r+x*b.radius*t,b.y+v*r+y*b.radius*t);return (at(1.27)-(at(.96)+at(1.04))/2)/255});return d.every(Number.isFinite)?med(d):NaN});
  return rings.every(Number.isFinite)?{value:med(rings),support:rings.filter(v=>v>=.10).length/rings.length}:null;
 }
 const groups=[choices.filter((_,i)=>i%2===0),choices.filter((_,i)=>i%2===1)];
 function fit(g){let best=null;for(let i=-5;i<=5;i++)for(let j=-5;j<=5;j++){const u=i*.08,v=j*.08,s=score(g,u,v);if(s&&(!best||s.value>best.value))best={u,v,...s}}const origin=score(g,0,0);return best&&origin?{...best,origin:origin.value}:null}
 const fits=groups.map(fit);if(fits.some(f=>!f))return {status:'unobservable'};
 const [f,g]=fits,u=(f.u+g.u)/2,v=(f.v+g.v)/2,s=groups.map(group=>score(group,u,v));
 const diagnostics={fits,proposed:[u*r,v*r],validation:s};
 if(s.some(x=>!x)||Math.hypot(f.u-g.u,f.v-g.v)>.12||fits.some(x=>Math.max(Math.abs(x.u),Math.abs(x.v))>=.4-1e-9)||s.some(x=>x.value<.12||x.support<.75))return {status:'insufficient-consensus',...diagnostics};
 if(Math.hypot(u,v)<.06||s.some((x,i)=>x.value-fits[i].origin<.025))return {status:'no-supported-change',...diagnostics};
 return {status:'proposed',dx:u*r,dy:v*r,matrix:translate(m,u*r,v*r),...diagnostics};
}
