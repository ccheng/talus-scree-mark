import {grayAt} from '../../app/src/omr-image.js';
import {project,invertProjective} from '../../app/src/projective.js';
import {pageRingCandidates} from '../../app/src/profile-authoring.js';
import {circularWitness} from '../../app/src/psa-registration/scope-shadow.js';
import {discoverResidualFootprints} from '../../app/src/psa-registration/reference-footprints.js';
function recoverLocal(gray,matrix,page,points,{grayAt,project}){
 const out=[],proposals=[],dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y),all=[...points];
 const dirs=Array.from({length:24},(_,i)=>[Math.cos(i*Math.PI/12),Math.sin(i*Math.PI/12)]);
 const sample=(x,y)=>{let p=project(matrix,x,y);return p?grayAt(gray,p.x,p.y):NaN};
 function score(p){
  const contrasts=dirs.map(([u,v])=>{const at=t=>sample(p.x+t*p.radius*u,p.y+t*p.radius*v);return Math.min(at(1.55),at(1.8))-Math.min(at(.85),at(1),at(1.15))});
  if(contrasts.some(v=>!Number.isFinite(v)))return null;
  const sorted=[...contrasts].sort((a,b)=>a-b),support=contrasts.filter(x=>x>=23).length;
  const inner=dirs.map(([u,v])=>sample(p.x+.45*p.radius*u,p.y+.45*p.radius*v)),bg=dirs.map(([u,v])=>sample(p.x+1.65*p.radius*u,p.y+1.65*p.radius*v));
  const med=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
  if(support<20||med(bg)-med(inner)>Math.max(20,.6*med(contrasts)))return null;
  return {support,score:sorted[5]+.2*sorted[12]};
 }
 for(const a of points)for(const b of points){
  const dx=b.x-a.x,dy=b.y-a.y,r=(a.radius+b.radius)/2;
  if(dx<2.8*r||dx>7.5*r||Math.abs(dy)>Math.max(1.1,.12*dx)||Math.abs(a.radius-b.radius)>.3*r)continue;
  for(const k of [-1,2]){const q={x:a.x+k*dx,y:a.y+k*dy,radius:r};
   if(q.x<2*r||q.y<2*r||q.x>page.width-2*r||q.y>page.height-2*r||all.some(p=>dist(p,q)<r*1.3)||proposals.some(p=>dist(p,q)<1.5))continue;
   proposals.push(q);if(proposals.length>=120)break;
  }if(proposals.length>=120)break;
 }
 for(const q of proposals.slice(0,120)){
   let candidates=[];for(const dx of [-.75,0,.75])for(const dy of [-.75,0,.75])for(const dr of [-.5,0,.5]){
     let p={x:q.x+dx,y:q.y+dy,radius:q.radius+dr};const s=score(p);if(s)candidates.push({...p,...s});
   }
   candidates.sort((a,b)=>b.score-a.score);const p=candidates[0];if(!p||all.some(a=>dist(a,p)<a.radius+p.radius-.5))continue;
   // A broad flat maximum does not establish unique local position.
   if(candidates.some(a=>dist(a,p)>1.25&&a.score>p.score*.93))continue;
   const newPoint={x:p.x,y:p.y,radius:p.radius,source:"local-measured-ring"};all.push(newPoint);out.push(newPoint);
 }
 return {points:all,added:out,proposals:proposals.length};
}




function associate(points){
 const P=points.map((p,i)=>({...p,i})), hypotheses=new Map();
 const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
 if(P.length>80)return {status:"unavailable",reason:"point-budget",rows:[],uncertain:[]};
 for(const a of P)for(const b of P){
   const dx=b.x-a.x,dy=b.y-a.y,r=(a.radius+b.radius)/2;
   if(dx<2.8*r||dx>7.5*r||Math.abs(dy)>Math.max(1.1,.17*dx)||Math.abs(a.radius-b.radius)>.3*r)continue;
   const ids=[a.i,b.i];
   for(let k=2;k<8;k++){
     const h=P.filter(p=>!ids.includes(p.i)&&Math.abs(p.radius-r)<=.3*r&&Math.hypot(p.x-a.x-k*dx,p.y-a.y-k*dy)<=Math.max(1.15,.32*r));
     if(h.length!==1)break;ids.push(h[0].i);
   }
   for(let k=2;k<=ids.length;k++){
     const ix=ids.slice(0,k),q=ix.map(i=>P[i]),meanY=q.reduce((s,p)=>s+p.y,0)/q.length;
     const err=q.reduce((s,p,j)=>s+Math.hypot(p.x-a.x-j*dx,p.y-a.y-j*dy),0)/q.length;
     const score=k-.65-2*Math.abs(dy/dx)-err/r;
     hypotheses.set(ix.join(","),{ix,score,meanY});
   }
 }
 if(hypotheses.size>500)return {status:"unavailable",reason:"hypothesis-budget",rows:[],uncertain:[]};
 // Connected components in the competing-hypothesis graph. Exact bounded
 // set packing in each component; near ties retained as uncertainty.
 const H=[...hypotheses.values()],used=new Set(),rows=[],uncertain=[];
 for(let i=0;i<H.length;i++){
   if(used.has(i))continue;let component=[i];used.add(i);
   for(let j=0;j<component.length;j++)for(let k=0;k<H.length;k++)if(!used.has(k)&&H[component[j]].ix.some(x=>H[k].ix.includes(x))){used.add(k);component.push(k)}
   if(component.length>22){uncertain.push({reason:"component-budget",candidates:component.map(k=>H[k].ix)});continue}
   let best=-Infinity,second=-Infinity,sol=[],alt=[],nodes=0,abort=false;
   const c=component.map(k=>H[k]).sort((a,b)=>b.score-a.score);
   function dfs(k,occupied,chosen,score){
     if(++nodes>100000){abort=true;return}
     if(k===c.length){if(score>best){second=best;alt=sol;best=score;sol=[...chosen]}else if(score>second){second=score;alt=[...chosen]}return}
     dfs(k+1,occupied,chosen,score);if(abort)return;
     if(c[k].ix.every(x=>!occupied.has(x))){dfs(k+1,new Set([...occupied,...c[k].ix]),[...chosen,c[k]],score+c[k].score)}
   }
   dfs(0,new Set(),[],0);
   if(abort||best-second<.25){uncertain.push({reason:abort?"search-budget":"near-tie",candidates:component.map(k=>H[k].ix),best,second});continue}
   for(const q of sol)rows.push({choices:q.ix.map(i=>P[i]),evidence:q.ix.length===2?"tentative-pair":"sequence",margin:best-second});
 }
 return {status:"observed",rows,uncertain,hypotheses:H.length};
}
function run(api,associate){
 const {project,invertProjective,pageRingCandidates,circularWitness,discoverResidualFootprints}=api;
 const page={width:240,height:260},row=(x,y,n,p=16,r=3.8)=>({choices:Array.from({length:n},(_,i)=>({x:x+i*p,y,radius:r}))});
 const cases=[{name:"three-with-gap",rows:[row(70,100,3)]},{name:"five-tight",rows:[row(65,130,5,13,3.8)]},{name:"adjacent-four-five",rows:[row(70,100,4,15,3.8),row(78,108,5,15,3.8)]},{name:"pair",rows:[row(80,110,2)]},{name:"mixed",rows:[row(75,105,3),row(83,114,5)]},{name:"mixed-close",rows:[row(70,105,3),row(78,113,4)]},{name:"five",rows:[row(80,110,5)]},{name:"text-pair",rows:[],decoy:[row(80,110,2)]},{name:"text-five",rows:[],decoy:[row(80,110,5)]},{name:"empty",rows:[]},{name:"broken-pair",rows:[row(80,110,2)],broken:true}];
 const modes=[{name:"very-low",scale:.82,contrast:125},{name:"normal",scale:2,contrast:190},{name:"low",scale:1.05,contrast:130},{name:"faint",scale:1.6,contrast:80}];
 const results=[];
 for(const c of cases)for(const m of modes){
   const matrix=[m.scale,0,10,0,m.scale,10,0,0,1],width=Math.ceil(page.width*m.scale+20),height=Math.ceil(page.height*m.scale+20),values=new Uint8Array(width*height).fill(240);
   for(const r of [...c.rows,...(c.decoy??[])])for(const [i,p] of r.choices.entries()){
     const pt=project(matrix,p.x,p.y),rr=Math.ceil(m.scale*(p.radius+1));
     for(let y=Math.floor(pt.y-rr);y<=pt.y+rr;y++)for(let x=Math.floor(pt.x-rr);x<=pt.x+rr;x++){
       let count=0;for(const dx of [-.25,.25])for(const dy of [-.25,.25]){const u=(x+dx-pt.x)/m.scale,v=(y+dy-pt.y)/m.scale;if(Math.abs(Math.hypot(u,v)-p.radius)<.6&&!(c.broken&&i===1&&u>0&&v<0))count++}
       values[y*width+x]=240-Math.round(m.contrast*count/4);
     }
   }
   const gray={width,height,values},rings=pageRingCandidates(gray,matrix,page,{minRadius:2,maxRadius:6,markedCenters:true,fineOutlines:true});
   const points=rings.filter(p=>circularWitness(gray,matrix,p));const old=discoverResidualFootprints(gray,matrix,{status:"observed",rows:[],rings});
   const next=associate(points),recovered=recoverLocal(gray,matrix,page,points,api),after=associate(recovered.points),hits=(a,b)=>a.choices.length===b.choices.length&&a.choices.every(p=>b.choices.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1.5));
   const truth=c.rows.flatMap(r=>r.choices);
   results.push({case:c.name,mode:m.name,expected:c.rows.length,visible:truth.filter(p=>points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1.5)).length,totalRings:truth.length,old:c.rows.filter(r=>old.rows.some(q=>hits(r,q))).length,next:c.rows.filter(r=>next.rows.some(q=>hits(r,q))).length,after:c.rows.filter(r=>after.rows.some(q=>hits(r,q))).length,visibleAfter:truth.filter(p=>recovered.points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1.5)).length,localAdded:recovered.added.length,localFalse:recovered.added.filter(q=>!truth.some(p=>Math.hypot(p.x-q.x,p.y-q.y)<1.5)).length,afterProposals:after.rows.length,oldProposals:old.rows.length,nextProposals:next.rows.length,uncertain:next.uncertain.length,oldAmbiguous:old.ambiguous.length});
 }
 return results;
}


console.log(JSON.stringify(run({grayAt,project,invertProjective,pageRingCandidates,circularWitness,discoverResidualFootprints},associate),null,2));