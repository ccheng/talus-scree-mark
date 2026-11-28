
import {refineSlot,translate} from './nr-local-pose.js';
import {observeSlot} from './nr-observability-strict.js';
export function run({predict,evaluateCompletion,readBubbleRegions,measureNumericalBlankInk}){
const segs={a:[-.27,-.49,.27,-.49],b:[.27,-.49,.27,0],c:[.27,0,.27,.49],d:[-.27,.49,.27,.49],e:[-.27,0,-.27,.49],f:[-.27,-.49,-.27,0],g:[-.27,0,.27,0]},digits=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
const dist=(x,y,[a,b,c,d])=>{const t=Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)));return Math.hypot(x-a-t*(c-a),y-b-t*(d-b))};
const scenarios=['clean','translation','slot-drift','smooth-warp','balanced-split','one-row-shift','two-row-shift','faint-print','broken-print','low-resolution','decoy-grid','reference-drift','rejected'];
const rows=[],items=[];
for(const [family,scale,radius,pitch,expected] of [[0,1.8,3.5,9.4,'3.14'],[1,2.6,4.2,10.6,'72  '],[2,3.2,3.8,9.8,'    '],[3,2.2,4.5,11.2,'8.6 ']]){
 let item={kind:'nr',id:'NR',slots:Array.from({length:4},(_,j)=>({id:'S'+j,choices:[...(j===1||j===2?[{symbol:'.',x:19+j*17,y:18,radius}]:[]),...Array.from({length:10},(_,k)=>({symbol:String(k),x:19+j*17,y:18+(k+1)*pitch,radius}))]}))};
 const truth=[...expected].map((symbol,j)=>({symbol:symbol===' '?null:symbol,eligible:!(family===3&&j===2),mode:family===3&&j===2?'half':j%2?'light':'dark'}));
 function shift(s,j,k,n){
  if(s==='translation')return [.78,-.54];
  if(s==='slot-drift')return [j%2?.9:-.9,j<2?-.5:.5];
  if(s==='smooth-warp')return [.45+1.35*(k/(n-1)-.5),-.45+.65*Math.sin(k/(n-1)*Math.PI)];
  if(s==='balanced-split')return k<Math.floor(n/2)?[.9,-.45]:[-.9,.45];
  if(s==='one-row-shift')return k===Math.floor(n/2)?[1.65,-.8]:[.55,-.35];
  if(s==='two-row-shift')return k===2||k===7?[1.65,-.8]:[.55,-.35];
  if(['faint-print','broken-print','low-resolution','reference-drift'].includes(s))return [.75,-.5];
  if(s==='decoy-grid')return [2.5,0];
  return [0,0];
 }
 function render(s,blank=false){
  const sc=s==='low-resolution'?.83:scale;
  // Projective, with slight skew and finite resolution. Render via inverse local page coordinates.
  const m=[sc,.065*sc,10,-.035*sc,sc,12,.00042,-.00023,1];
  const [a,b,c,d,e,f,g,h,i]=m,iv=[e*i-f*h,c*h-b*i,b*f-c*e,f*g-d*i,a*i-c*g,c*d-a*f,d*h-e*g,b*g-a*h,a*e-b*d];
  const xy=(x,y)=>{let w=iv[6]*x+iv[7]*y+iv[8];return [(iv[0]*x+iv[1]*y+iv[2])/w,(iv[3]*x+iv[4]*y+iv[5])/w]};
  const width=Math.ceil(100*sc+30),height=Math.ceil((45+11*pitch)*sc+35),values=new Uint8Array(width*height);
  const rings=item.slots.flatMap((slot,j)=>slot.choices.map((b,k)=>{
   const delta=blank?(s==='reference-drift'?[.85,-.55]:[0,0]):shift(s,j,k,slot.choices.length);
   return {...b,j,k,dx:delta[0],dy:delta[1]};
  }));
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
   let ink=0;
   for(const ox of [-.28,.28])for(const oy of [-.28,.28]){
    const [px,py]=xy(x+ox,y+oy);let dark=0;
    for(const b of rings){
     const u=(px-b.x-b.dx)/b.radius,v=(py-b.y-b.dy)/b.radius,rr=Math.hypot(u,v);
     if(rr<1.3){
      const ang=Math.atan2(v,u);
      const outline=Math.abs(rr-1)<(.31+family*.035)/b.radius;
      if(outline&&!(s==='broken-print'&&Math.cos(ang*3+b.k)>0.1))dark=Math.max(dark,s==='faint-print'?.24:.88);
      const glyph=b.symbol==='.'?Math.hypot(u,v-.37)<.10:digits[Number(b.symbol)].split('').some(k=>dist(u,v,segs[k])<.08);
      if(glyph)dark=Math.max(dark,.80);
      const t=truth[b.j];
      if(!blank&&b.symbol===t.symbol&&rr<.89){
       const mark=t.mode==='half'?(u<-.04?.81:0):t.mode==='light'?.22+.075*Math.sin(18*u+11*v):.67+.15*Math.sin(22*u-14*v);
       dark=Math.max(dark,mark);
      }
     }
     // Intentionally identical false ring at a nearby location, stronger than the real ring.
     if(s==='decoy-grid'&&!blank){const q=Math.hypot((px-b.x-.50)/b.radius,(py-b.y+.30)/b.radius);if(Math.abs(q-1)<.39/b.radius)dark=Math.max(dark,.98)}
    }
    ink+=dark/4;
   }
   const paper=238-24*x/width+13*Math.sin(y/height*3.2)-18*Math.exp(-((x/width-.25)**2+(y/height-.55)**2)/.045);
   const noise=2.2*Math.sin(x*19.91+y*7.33+family*8);
   values[y*width+x]=Math.max(0,Math.min(255,Math.round(paper*(1-ink)+27*ink+noise)));
  }
  // Mild optical blur, with stronger blur for low-resolution captures.
  const copy=values.slice(),w=s==='low-resolution'?.18:.065;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){const i=y*width+x;values[i]=Math.round((1-4*w)*copy[i]+w*(copy[i-1]+copy[i+1]+copy[i-width]+copy[i+width]))}
  return {gray:{width,height,values},pageToSource:m,status:'registered'};
 }
 const blank=render('clean',true);
 item=measureNumericalBlankInk(blank.gray,blank.pageToSource,[{id:'NR',kind:'nr',items:[item]}])[0].items[0];
 for(const s of scenarios){
  const scan=render(s),ref=s==='reference-drift'?render(s,true):blank;
  const reg={status:s==='rejected'?'rejected':'registered',pageToSource:scan.pageToSource};
  const byPose={baseline:[],r9:[],r10:[]};
  for(const [j,slot] of item.slots.entries()){
   const q=observeSlot(scan.gray,reg,slot.choices),r9=q.correction; const blankAudit=observeSlot(ref.gray,ref,slot.choices); const blankSupported=blankAudit.state==='supported-original';
   const truthD=slot.choices.map((b,k)=>shift(s,j,k,slot.choices.length));
   const errors=(dx,dy)=>truthD.map(([x,y])=>Math.hypot(x-dx,y-dy));
   const before=errors(0,0),after=errors(r9.dx??0,r9.dy??0);
   const row={family,scenario:s,slot:j,...truth[j],r9:r9.status,r10:blankSupported?q.state:'reference-unreliable',supported:q.supported??null,blankState:blankAudit.state,blankSupported,beforeMax:Math.max(...before),afterMax:Math.max(...after),beforeMean:before.reduce((a,b)=>a+b)/before.length,afterMean:after.reduce((a,b)=>a+b)/after.length,methods:{}};
   if(reg.status==='registered'){
    const one={...item,slots:[slot]},profile={components:[{id:'NR',kind:'nr',items:[one]}]};
    for(const [name,m] of Object.entries({baseline:reg.pageToSource,r9:r9.matrix??reg.pageToSource,r10:blankSupported?q.matrix:null})){
     if(!m){row.methods[name]={est:{accepted:false,symbol:null},cpas:{accepted:false,symbol:null}};continue}
     const est=readBubbleRegions(scan.gray,m,[one]),e=est[0].slots[0],c=evaluateCompletion(scan.gray,profile,{status:'registered',pageToSource:m},{reference:ref,predict,established:est}).items[0].slots[0];
     row.methods[name]={est:{accepted:!e.review&&['single','blank'].includes(e.status),symbol:e.symbol},cpas:{accepted:['single','blank'].includes(c.optical)&&c.evidenceComplete,symbol:c.symbol}};
    }
    for(const name of Object.keys(byPose))byPose[name].push(row.methods[name]);
   }
   rows.push(row);
  }
  for(const [pose,obs] of Object.entries(byPose)){
   if(!obs.length)continue;
   for(const engine of ['est','cpas']){
    const text=obs.map(v=>v[engine].symbol??' ').join('');
    const accepted=obs.every(v=>v[engine].accepted)&&(!text.trim()||/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)? *$/.test(text));
    items.push({family,scenario:s,pose,engine,eligible:truth.every(t=>t.eligible)&&s!=='decoy-grid',accepted,text,expected});
   }
  }
 }
}
return {rows,items,limits:'New authored projective raster challenge, not real camera images. Fixed seven-segment glyphs, repeated families; no exact open or sealed fixtures. Geometry truth known. Decoy is incompatible synthetic structure but registration intentionally forced registered to probe post-registration behavior. Reference-drift deliberately mismatches blank pose. Whole-item aggregation is a research literal decision, not native authoritative grading.'};
}
