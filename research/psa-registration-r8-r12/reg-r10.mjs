import {project,invertProjective} from '../../app/src/projective.js';
import {pageRingCandidates} from '../../app/src/profile-authoring.js';
import {circularWitness} from '../../app/src/psa-registration/scope-shadow.js';
import {discoverResidualFootprints} from '../../app/src/psa-registration/reference-footprints.js';
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
 const cases=[{name:"pair",rows:[row(80,110,2)]},{name:"mixed",rows:[row(75,105,3),row(83,114,5)]},{name:"mixed-close",rows:[row(70,105,3),row(78,113,4)]},{name:"five",rows:[row(80,110,5)]},{name:"text-pair",rows:[],decoy:[row(80,110,2)]},{name:"text-five",rows:[],decoy:[row(80,110,5)]},{name:"empty",rows:[]},{name:"broken-pair",rows:[row(80,110,2)],broken:true}];
 const modes=[{name:"normal",scale:2,contrast:190},{name:"low",scale:1.05,contrast:130},{name:"faint",scale:1.6,contrast:80}];
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
   const next=associate(points),hits=(a,b)=>a.choices.length===b.choices.length&&a.choices.every(p=>b.choices.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1.5));
   const truth=c.rows.flatMap(r=>r.choices);
   results.push({case:c.name,mode:m.name,expected:c.rows.length,visible:truth.filter(p=>points.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<1.5)).length,totalRings:truth.length,old:c.rows.filter(r=>old.rows.some(q=>hits(r,q))).length,next:c.rows.filter(r=>next.rows.some(q=>hits(r,q))).length,oldProposals:old.rows.length,nextProposals:next.rows.length,uncertain:next.uncertain.length,oldAmbiguous:old.ambiguous.length});
 }
 return results;
}
console.log(JSON.stringify(run({project,invertProjective,pageRingCandidates,circularWitness,discoverResidualFootprints},associate),null,2));
