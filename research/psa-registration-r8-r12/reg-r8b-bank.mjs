// Fixed-window probe of pinned bank, exact private classifier/canonical functions copied from raster.js.
import {readFileSync} from 'node:fs';
import {grayAt} from '../../app/src/omr-image.js';
import {compareMcPrint} from '../../app/src/psa-registration/mc-same-print.js';
import {hog324} from '../../app/src/psa-nr/hog.js';
import {loadBank} from '../../app/src/psa-mc/raster.js';
const quant=(a,p)=>{const q=[...a].sort((a,b)=>a-b),k=(q.length-1)*p,i=Math.floor(k);return q[i]+(q[Math.min(i+1,q.length-1)]-q[i])*(k-i);};
function sample(im,w,h,x,y,outside=255){if(x<0||x>w-1||y<0||y>h-1)return outside;const i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,k=Math.min(i+1,w-1),l=Math.min(j+1,h-1);return (im[j*w+i]*(1-u)+im[j*w+k]*u)*(1-v)+(im[l*w+i]*(1-u)+im[l*w+k]*u)*v;}
function canonical(p,w,h){const a=Float32Array.from(p,v=>v<.10?0:v),nz=Array.from(a).filter(v=>v>0),peak=nz.length?quant(nz,.9):0;if(peak<.025)return new Uint8Array(576);let x0=w,y0=h,x1=-1,y1=-1;for(let j=0;j<h;j++)for(let i=0;i<w;i++){const k=j*w+i;a[k]=Math.min(1,a[k]/peak);if(a[k]>.3){x0=Math.min(x0,i);x1=Math.max(x1,i);y0=Math.min(y0,j);y1=Math.max(y1,j);}}if(x1<0)return new Uint8Array(576);const sw=x1-x0+1,sh=y1-y0+1,s=Math.min(20/sw,20/sh),nw=Math.max(1,Math.round(sw*s)),nh=Math.max(1,Math.round(sh*s)),z=new Uint8Array(576),ox=Math.floor((24-nw)/2),oy=Math.floor((24-nh)/2);for(let j=0;j<nh;j++)for(let i=0;i<nw;i++){const x=x0+Math.max(0,Math.min(sw-1,(i+.5)*sw/nw-.5)),y=y0+Math.max(0,Math.min(sh-1,(j+.5)*sh/nh-.5));z[(oy+j)*24+ox+i]=Math.floor(sample(a,w,h,x,y,0)*255);}return z;}
function classify(f,bank){const best=new Map();for(let i=0;i<bank.labels.length;i++){let d=0;for(let j=0;j<324;j++){const z=f[j]-bank.features[i*324+j];d+=z*z;}const c=bank.labels[i];if(d<(best.get(c)??Infinity))best.set(c,d);}const rank=[...best].sort((a,b)=>a[1]-b[1]||a[0].localeCompare(b[0]));return [rank[0][0],Math.sqrt(rank[0][1]),Math.sqrt(rank[1][1])-Math.sqrt(rank[0][1])];}
const meta=JSON.parse(readFileSync(new URL('../../app/assets/psa-mc/glyph-bank.json',import.meta.url),'utf8'));
const bank=loadBank(meta,readFileSync(new URL('../../app/assets/psa-mc/glyph-bank.f32',import.meta.url)));


function run(api){
 const {compareMcPrint,grayAt,canonical,classify,hog324,bank}=api,N=35,mid=17,step=.25;
 // Deliberately synthetic stroke families, not actual ISTE condensed type.
 const glyph={B:[[[0,0],[0,1]],[[0,0],[.7,0],[1,.22],[.7,.49],[0,.49]],[[.7,.49],[1,.74],[.7,1],[0,1]]],K:[[[0,0],[0,1]],[[1,0],[0,.52],[1,1]]],R:[[[0,1],[0,0],[.75,0],[1,.24],[.75,.5],[0,.5]],[[.5,.5],[1,1]]],P:[[[0,1],[0,0],[.75,0],[1,.24],[.75,.5],[0,.5]]],D:[[[0,0],[0,1],[.65,1],[1,.7],[1,.3],[.65,0],[0,0]]],A:[[[0,1],[.5,0],[1,1]],[[.22,.6],[.78,.6]]]};
 const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
 function ink(g,x,y,style){const [w,h,t,slant]=style;let best=Infinity;for(const path of glyph[g])for(let i=1;i<path.length;i++){const p=path[i-1],q=path[i],ax=(p[0]-.5)*w+slant*(p[1]-.5),ay=(p[1]-.5)*h,bx=(q[0]-.5)*w+slant*(q[1]-.5),by=(q[1]-.5)*h,dx=bx-ax,dy=by-ay,u=clamp(((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy),0,1);best=Math.min(best,Math.hypot(x-ax-u*dx,y-ay-u*dy))}return best<t?1:0}
 function camera(g,style,mode,seed,damage){let rnd=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296},s=mode.scale,c=mode.angle*Math.PI/180,co=Math.cos(c),si=Math.sin(c),phaseX=rnd()-.5,phaseY=rnd()-.5,w=65,h=65,values=new Uint8Array(w*h),cx=32,cy=32;
 for(let j=0;j<h;j++)for(let i=0;i<w;i++){let mass=0;for(let a=0;a<3;a++)for(let b=0;b<3;b++){let u=(i-cx-phaseX+(a-1)*mode.aperture/3)/s,v=(j-cy-phaseY+(b-1)*mode.aperture/3)/s,x=co*u+si*v,y=-si*u+co*v,z=ink(g,x,y,style);if(damage==="erase"&&x>0&&y>-.8)z*=.15;if(damage==="scribble"&&Math.abs(y-.35*x)<.25&&Math.abs(x)<3)z=1;mass+=z/9}values[j*w+i]=Math.round(clamp(240-mode.contrast*mass+(rnd()-.5)*mode.noise,0,255))}
 const matrix=[s*co,-s*si,cx+phaseX,s*si,s*co,cy+phaseY,0,0,1];return {gray:{width:w,height:h,values},matrix};
 }
 function patch(c){const {gray,matrix:m}=c;let v=[];for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=(x-mid)*step,t=(y-mid)*step;v.push(Math.max(0,240-grayAt(gray,m[0]*u+m[1]*t+m[2],m[3]*u+m[4]*t+m[5])))}return v}
 const sum=a=>a.reduce((s,x)=>s+x,0),mean=a=>sum(a)/a.length;
 function norm(v){let peak=Math.max(...v);return v.map(x=>x/Math.max(1,peak))}
 function features(v){let a=norm(v),out=[];for(let gy=0;gy<5;gy++)for(let gx=0;gx<5;gx++){let bins=[0,0,0,0],mass=0;for(let y=gy*7+1;y<Math.min(N-1,(gy+1)*7);y++)for(let x=gx*7+1;x<Math.min(N-1,(gx+1)*7);x++){let i=y*N+x,dx=a[i+1]-a[i-1],dy=a[i+N]-a[i-N],ang=(Math.atan2(dy,dx)+Math.PI)%Math.PI,k=Math.min(3,Math.floor(4*ang/Math.PI));bins[k]+=Math.hypot(dx,dy);mass+=a[i]}out.push(...bins.map(x=>x/(1+sum(bins))),mass/49)}return out}
 function dist(a,b){return mean(a.map((x,i)=>Math.abs(x-b[i])))}
 function compare(ref,scan){let a=patch(ref),b=patch(scan);const site={kind:"header",block:"b",symbol:"B",x:0,y:0,reference:a.map(Math.round),pixelsPerPoint:3.2};const old=compareMcPrint(scan.gray,{pageToSource:scan.matrix},[site])[0];let aa=norm(a),bb=norm(b);const binary=(v)=>v.map(x=>x>.45?1:0);let ar=binary(aa),br=binary(bb);let add=0,remove=0,union=0;for(let i=0;i<ar.length;i++){add+=!ar[i]&&br[i]?1:0;remove+=ar[i]&&!br[i]?1:0;union+=ar[i]||br[i]?1:0}const [label,distance,margin]=classify(hog324(canonical(Float32Array.from(b,x=>x/255),N,N)),bank);return {label,distance,margin,ncc:old.distance??null,status:old.status,hog:dist(features(a),features(b)),ink:dist(aa,bb),add:add/Math.max(1,union),remove:remove/Math.max(1,union)}}
 const styles=[[4.4,6.7,.37,0],[3.0,6.7,.42,.15],[2.4,6.5,.43,-.1],[2.8,6.2,.48,.25],[4.1,6.3,.52,-.35],[2.1,6.8,.31,.1]];
 const modes=[{name:"clear",scale:2.4,angle:0,contrast:200,noise:4,aperture:1},{name:"oblique",scale:1.6,angle:17,contrast:145,noise:8,aperture:1.5},{name:"low",scale:.95,angle:90,contrast:125,noise:12,aperture:1.5}];let rows=[];
 for(let f=0;f<styles.length;f++)for(const expected of ["B","A","D"])for(let j=0;j<modes.length;j++)for(let trial=0;trial<2;trial++){const ref=camera(expected,styles[f],{scale:3.2,angle:0,contrast:215,noise:2,aperture:1},123+f);const substitutions=expected==="B"?["K","D"]:expected==="A"?["B","K"]:["B","A"];for(const [actual,damage] of [[expected,null],...substitutions.map(x=>[x,null]),[expected,"erase"],[expected,"scribble"]]){const scan=camera(actual,styles[f],modes[j],10000*f+1000*j+trial+expected.charCodeAt(0),damage);rows.push({f,expected,actual,damage,mode:modes[j].name,trial,changed:actual!==expected,...compare(ref,scan)})}}

 const cal=rows.filter(r=>r.f<3&&!r.changed&&!r.damage&&r.label===r.expected);
 const limit=Math.max(...cal.map(r=>r.distance)),margin=Math.max(.05,Math.min(...cal.map(r=>r.margin)));
 const held=rows.filter(r=>r.f>=3),groups={};
 for(const name of ["same","known-change","unknown-change","erase","scribble"]){
 const rs=held.filter(r=>name==="same"?!r.changed&&!r.damage:name==="known-change"?r.changed&&r.actual!=="K":name==="unknown-change"?r.changed&&r.actual==="K":r.damage===name);
 const usable=r=>r.distance<=limit&&r.margin>=margin,mismatch=r=>usable(r)&&r.label!==r.expected;
 groups[name]={total:rs.length,baseline:rs.filter(r=>r.status==="mismatch").length,correctLabel:rs.filter(r=>r.label===r.actual).length,usable:rs.filter(usable).length,identityMismatch:rs.filter(mismatch).length,combinedEither:rs.filter(r=>mismatch(r)||r.status==="mismatch").length,combinedBoth:rs.filter(r=>mismatch(r)&&r.status==="mismatch").length,unknownForcedLabel:rs.filter(r=>r.actual==="K"&&usable(r)).length};
 }
 return {note:"Actual frozen MC bank and HOG; oracle synthetic windows; new held-out stroke styles, not independent ISTE photos; K outside bank",bankLabels:[...new Set(bank.labels)],templates:bank.labels.length,calibrationCorrect:cal.length,calibrationTotal:rows.filter(r=>r.f<3&&!r.changed&&!r.damage).length,limit,margin,total:rows.length,groups,rows};
}

console.log(JSON.stringify(run({grayAt,compareMcPrint,canonical,classify,hog324,bank}),null,2));
