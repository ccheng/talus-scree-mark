// REG-R6 raster pilot, run from repository root: node research/psa-registration-r4-r7/reg-r6.mjs
import {pageRingCandidates} from '../../app/src/profile-authoring.js';
import {observeScopeRows,classifyScopeEvidence} from '../../app/src/psa-registration/scope-shadow.js';
import {baseRows} from '../../app/src/psa-mc/structure.js';
import {grayAt} from '../../app/src/omr-image.js';
import {project,invertProjective} from '../../app/src/projective.js';
function discoverIndependentRows(gray,matrix,profile,known,baseline,{pageRingCandidates,grayAt,project,baseRows}){
 const required=profile.components.filter(b=>b.kind==="mc").flatMap(b=>b.items), nr=profile.components.filter(b=>b.kind==="nr").flatMap(b=>b.items.flatMap(i=>i.slots.flatMap(s=>s.choices)));
 if(baseline.status!=="observed")return {status:"unavailable",reason:"baseline-lanes-unavailable",rows:[]};
 const all=[...required,...known],radii=all.flatMap(r=>r.choices.map(c=>c.radius)), min=Math.min(...radii),max=Math.max(...radii);
 const points=pageRingCandidates(gray,matrix,profile.page,{minRadius:min*.60,maxRadius:max*1.4,markedCenters:true,fineOutlines:true,limit:900});
 if(points.length>=900)return {status:"unavailable",reason:"observation-limit",rows:baseline.rows};
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 const used=baseline.rows.flatMap(r=>r.choices);
 const residual=points.filter(p=>!used.some(q=>dist(p,q)<=1.5)&&!nr.some(q=>dist(p,q)<=Math.max(2,q.radius)));
 const witnessed=residual.filter(p=>Array.from({length:12},(_,i)=>i*Math.PI/6).filter(a=>{
   const s=t=>{const q=project(matrix,p.x+t*p.radius*Math.cos(a),p.y+t*p.radius*Math.sin(a));return q?grayAt(gray,q.x,q.y):NaN};
   return s(1.55)-Math.min(s(.88),s(1.02),s(1.16))>=26;
 }).length>=10);
 // reuse existing PSA family detector, but it needs >=2 rows and 4 or 5 choices;
 // only fully observed rows count; inferred positions are not structural evidence.
 const family=baseRows(witnessed.map(p=>[p.x,p.y,p.radius])).filter(r=>r.observed.every(Boolean));
 const hypotheses=new Map();const near=(x,y,r)=>{let best=null,d=Infinity;for(let i=0;i<witnessed.length;i++){const p=witnessed[i],q=Math.hypot(p.x-x,p.y-y);if(q<d&&Math.abs(p.radius-r)<=.30*r){d=q;best=i}}return d<=Math.max(1.5,.32*r)?best:null;};
 const lengths=[...new Set(all.map(r=>r.choices.length).filter(n=>n>=3&&n<=8))];
 // Arbitrary translation, same bounded spacing and orientation; three-ring
 // singleton is reported as tentative evidence, never a certified row.
 for(let i=0;i<witnessed.length;i++)for(let j=0;j<witnessed.length;j++){
   const a=witnessed[i],b=witnessed[j],dx=b.x-a.x,dy=b.y-a.y,r=(a.radius+b.radius)/2;
   if(dx<2.8*r||dx>7.5*r||Math.abs(dy)>Math.max(1.5,.17*dx)||Math.abs(a.radius-b.radius)>.30*r)continue;
   for(const n of [...lengths].sort((a,b)=>b-a)){
     const idx=Array.from({length:n},(_,k)=>near(a.x+k*dx,a.y+k*dy,r));
     if(idx.some(k=>k===null)||new Set(idx).size!==n)continue;
     const key=[...idx].sort((a,b)=>a-b).join(",");
     hypotheses.set(key,{idx,choices:idx.map(k=>witnessed[k]),pitch:Math.hypot(dx,dy),n});break;
   }
 }
 const proposals=[...hypotheses.values()].filter(a=>![...hypotheses.values()].some(b=>b.idx.length>a.idx.length&&a.idx.every(i=>b.idx.includes(i))));
 const ambiguous=proposals.filter(a=>proposals.some(b=>a!==b&&a.idx.some(i=>b.idx.includes(i))));
 const accepted=proposals.filter(a=>!ambiguous.includes(a));
 const rows=accepted.map((r,i)=>({id:"out-of-lane-"+i,choices:r.choices,evidence:r.n>=4?"full-ring-sequence":"tentative-three-ring-sequence"}));
 // Even no candidates cannot prove absence beyond the coverage envelope.
 return {status:"observed",rows:[...baseline.rows,...rows],newRows:rows,ambiguous:ambiguous.length,familyCount:family.length,ringCount:points.length,residualCount:residual.length,witnessCount:witnessed.length,coverage:"bounded page ring search; absence not verified"};
}
function run(api,discover){
 const {observeScopeRows,classifyScopeEvidence,project,invertProjective}=api;
 const page={width:360,height:440},radius=4.5;
 const makeRow=(id,x,y,n=4,pitch=19,r=radius,slope=0)=>({id,choices:Array.from({length:n},(_,j)=>({x:x+j*pitch,y:y+j*pitch*slope,radius:r,symbol:"ABCDEFGH"[j]}))});
 const required=[makeRow("q1",70,105),makeRow("q2",70,127),makeRow("q3",70,149)];
 const known=makeRow("excluded",70,171);
 const profile={page,scope:"mc-only",mcCompleteness:"partial",exclusions:[{x:60,y:161,width:80,height:20}],components:[{id:"mc",kind:"mc",items:required}]};
 const full={...profile,mcCompleteness:"complete",exclusions:[]};
 const s=2.2;
 const variants=[{name:"upright",m:[s,0,15,0,s,15,0,0,1],width:830,height:1005,noise:3,contrast:210},{name:"oblique",m:[2.05,.15,16,.08,1.95,20,.00018,.00023,1],width:830,height:1005,noise:7,contrast:165},{name:"quarter-turn",m:[0,-1.8,810,1.8,0,15,0,0,1],width:830,height:680,noise:5,contrast:195}];
 function draw(rows,variant,decoy,marks=false){
   const {m,width,height,noise,contrast}=variant,inv=invertProjective(m),values=new Uint8Array(width*height);let seed=7919;
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values[y*width+x]=Math.round(238-12*x/width+noise*(seed/4294967296-.5));}
   function inkShape(cx,cy,r,fn){
     const p=project(m,cx,cy);if(!p)return;const rr=Math.ceil(3*r+4);
     for(let y=Math.max(0,Math.floor(p.y-rr));y<Math.min(height,p.y+rr+1);y++)for(let x=Math.max(0,Math.floor(p.x-rr));x<Math.min(width,p.x+rr+1);x++){
       let ink=0;for(const dx of [-.25,.25])for(const dy of [-.25,.25]){const q=project(inv,x+dx,y+dy);if(q&&fn(q.x-cx,q.y-cy))ink+=.25;}
       const k=y*width+x;values[k]=Math.max(0,Math.round(values[k]-ink*contrast));
     }
   }
   for(const [ri,row] of rows.entries())for(const [i,p] of row.choices.entries())inkShape(p.x,p.y,p.radius+2,(x,y)=>Math.abs(Math.hypot(x,y)-p.radius)<.55||(marks&&i===ri%row.choices.length&&Math.hypot(x,y)<p.radius-.35));
   if(decoy==="text")for(let i=0;i<6;i++){const x=184+i*13,y=260;inkShape(x,y,7,(u,v)=>(Math.abs(u)<.55&&Math.abs(v)<3.5)||(Math.abs(v)<.55&&Math.abs(u)<2.8));}
   if(decoy==="O-text")for(let i=0;i<4;i++)inkShape(190+i*19,280,7,(u,v)=>Math.abs(Math.hypot(u,v)-radius)<.55);
   if(decoy==="irregular")for(const [x,y] of [[190,270],[212,273],[240,266],[255,286],[290,268]])inkShape(x,y,7,(u,v)=>Math.abs(Math.hypot(u,v)-radius)<.55);
   return {width,height,values};
 }
 const cases=[
   {name:"clean",p:profile,rows:required,expected:[],want:"geometry-consistent"},
   {name:"known-excluded",p:profile,known:[known],rows:[...required,known],expected:[],want:"geometry-consistent"},
   {name:"aligned-extra",p:profile,rows:[...required,known],expected:[known],want:"review"},
   {name:"shifted-single",p:profile,rows:[...required,makeRow("new",105,192)],expected:[makeRow("new",105,192)],want:"review"},
   {name:"distant-single",p:profile,rows:[...required,makeRow("new",220,290)],expected:[makeRow("new",220,290)],want:"review"},
   {name:"distant-family",p:profile,rows:[...required,makeRow("new1",205,290),makeRow("new2",205,315)],expected:[makeRow("new1",205,290),makeRow("new2",205,315)],want:"review"},
   {name:"complete-distant",p:full,rows:[...required,makeRow("new",220,290)],expected:[makeRow("new",220,290)],want:"withhold"},
   {name:"missing-required",p:profile,rows:[required[0],required[2]],expected:[],want:"withhold"},
   {name:"text-decoys",p:profile,rows:required,expected:[],decoy:"text",want:"geometry-consistent"},
   {name:"irregular-rings",p:profile,rows:required,expected:[],decoy:"irregular",want:"geometry-consistent"},
   {name:"O-like-text-identical-rings",p:profile,rows:required,expected:[],decoy:"O-text",want:"geometry-consistent"},
   {name:"marked-distant",p:profile,rows:[...required,makeRow("new",220,290)],expected:[makeRow("new",220,290)],marks:true,want:"review"},
 ];
 const results=[];
 const hit=(a,b)=>a.choices.length===b.choices.length&&a.choices.every(p=>b.choices.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<=1.5));
 for(const v of variants)for(const c of cases){
   const g=draw(c.rows,v,c.decoy,c.marks),knownRows=c.known??[],old=observeScopeRows(g,v.m,c.p,knownRows);
   const next=discover(g,v.m,c.p,knownRows,old,api);
   const od=old.status==="observed"?classifyScopeEvidence(c.p,knownRows,old.rows):old;
   const nd=next.status==="observed"?classifyScopeEvidence(c.p,knownRows,next.rows):next;
   const extras=next.rows.filter(r=>![...required,...knownRows].some(k=>hit(k,r)));
   results.push({case:c.name,variant:v.name,expected:c.want,old:od.status,next:nd.status,oldTrue:c.expected.filter(e=>old.rows?.some(r=>hit(e,r))).length,newTrue:c.expected.filter(e=>next.rows.some(r=>hit(e,r))).length,trueTotal:c.expected.length,falseExtra:extras.filter(r=>!c.expected.some(e=>hit(e,r))).length,added:next.newRows?.length??0,family:next.familyCount??0,ambiguous:next.ambiguous??0,outlineCount:next.ringCount??null,baselineRows:old.rows?.length??0});
 }
 return {note:"PSA-authored synthetic page raster, oracle page transforms, actual pinned ring detector and scope classifier; no end-to-end registration or ISTE fixture replay",count:results.length,oldCorrect:results.filter(r=>r.old===r.expected).length,newCorrect:results.filter(r=>r.next===r.expected).length,oldTrue:results.reduce((s,r)=>s+r.oldTrue,0),newTrue:results.reduce((s,r)=>s+r.newTrue,0),trueTotal:results.reduce((s,r)=>s+r.trueTotal,0),falseExtra:results.reduce((s,r)=>s+r.falseExtra,0),results};
}
export {discoverIndependentRows};
const api={pageRingCandidates,observeScopeRows,classifyScopeEvidence,baseRows,grayAt,project,invertProjective};console.log(JSON.stringify(run(api,discoverIndependentRows),null,2));
