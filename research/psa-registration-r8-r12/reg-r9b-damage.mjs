import {grayAt} from '../../app/src/omr-image.js';
import {compareMcPrint} from '../../app/src/psa-registration/mc-same-print.js';


function run(api){
 const {compareMcPrint,grayAt}=api,N=35,mid=17,step=.25;
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
 function compare(ref,scan){let a=patch(ref),b=patch(scan);const site={kind:"header",block:"b",symbol:"B",x:0,y:0,reference:a.map(Math.round),pixelsPerPoint:3.2};const old=compareMcPrint(scan.gray,{pageToSource:scan.matrix},[site])[0];let aa=norm(a),bb=norm(b);const binary=(v)=>v.map(x=>x>.45?1:0);let ar=binary(aa),br=binary(bb);let add=0,remove=0,union=0;for(let i=0;i<ar.length;i++){add+=!ar[i]&&br[i]?1:0;remove+=ar[i]&&!br[i]?1:0;union+=ar[i]||br[i]?1:0}return {ncc:old.distance??null,status:old.status,hog:dist(features(a),features(b)),ink:dist(aa,bb),add:add/Math.max(1,union),remove:remove/Math.max(1,union)}}
 const styles=[[4.4,6.7,.37,0],[3.0,6.7,.42,.15],[2.4,6.5,.43,-.1],[2.65,6.2,.44,.21],[4.25,6.35,.49,-.32],[2.05,6.95,.35,.12]];
 const modes=[{name:"clear",scale:2.4,angle:0,contrast:200,noise:4,aperture:1},{name:"oblique",scale:1.6,angle:17,contrast:145,noise:8,aperture:1.5},{name:"low",scale:.95,angle:90,contrast:125,noise:12,aperture:1.5}];let rows=[];
 for(let f=0;f<styles.length;f++)for(const expected of ["B","R","D"])for(let j=0;j<modes.length;j++)for(let trial=0;trial<2;trial++){const ref=camera(expected,styles[f],{scale:3.2,angle:0,contrast:215,noise:2,aperture:1},123+f);const substitutions=expected==="B"?["K","D"]:expected==="R"?["P","K"]:["B","A"];for(const [actual,damage] of [[expected,null],...substitutions.map(x=>[x,null]),[expected,"erase"],[expected,"scribble"]]){const scan=camera(actual,styles[f],modes[j],10000*f+1000*j+trial+expected.charCodeAt(0),damage);rows.push({f,expected,actual,damage,mode:modes[j].name,trial,changed:actual!==expected,...compare(ref,scan)})}}

 // Calibration on same-print captures only. No adjustment on reserve outcomes.
 const cal=rows.filter(r=>r.f<3&&!r.changed&&!r.damage);
 const thresholds={add:Math.max(...cal.map(r=>r.add))+.01,remove:Math.max(...cal.map(r=>r.remove))+.01};
 const held=rows.filter(r=>r.f>=3),groups={};
 for(const type of ["same","change","erase","scribble"]){
 const rs=held.filter(r=>type==="same"?!r.changed&&!r.damage:type==="change"?r.changed:r.damage===type);
 const both=r=>r.add>thresholds.add&&r.remove>thresholds.remove;
 const one=r=>(r.add>thresholds.add)!==(r.remove>thresholds.remove);
 groups[type]={total:rs.length,baseline:rs.filter(r=>r.status==="mismatch").length,twoSided:rs.filter(both).length,oneSided:rs.filter(one).length,corroborated:rs.filter(r=>both(r)&&r.status==="mismatch").length};
 }
 // Idealized perfect removal of R's extra diagonal stroke, leaving its
 // unchanged underlying P-like strokes. Render separately under identical
 // sensor phase/noise; do not simply compare an array with itself.
 glyph["R-erased"]=glyph.R.slice(0,-1);
 const equivalence=[];
 for(const style of styles.slice(3))for(const mode of modes){
   const ref=camera("R",style,{scale:3.2,angle:0,contrast:215,noise:2,aperture:1},888);
   const printed=camera("P",style,mode,77,null),erased=camera("R-erased",style,mode,77,null);
   const a=compare(ref,printed),b=compare(ref,erased);
   equivalence.push({mode:mode.name,equalPixels:printed.gray.values.every((v,i)=>v===erased.gray.values[i]),sameComparator:JSON.stringify(a)===JSON.stringify(b),printedStatus:a.status,erasedStatus:b.status});
 }
 return {note:"Synthetic new style reserve, directional stroke-change heuristic; idealized pixel-equivalence control is not a claim about prevalence of real erasure",total:rows.length,thresholds,groups,equivalence,rows};
}

console.log(JSON.stringify(run({grayAt,compareMcPrint}),null,2));