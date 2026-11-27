import {grayAt} from '../../app/src/omr-image.js';
import {project} from '../../app/src/projective.js';
import {pageRingCandidates} from '../../app/src/profile-authoring.js';
import {circularWitness} from '../../app/src/psa-registration/scope-shadow.js';
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
 const {grayAt,project,pageRingCandidates,circularWitness}=api,page={width:230,height:245},radius=3.8;
 const row=(x,y)=>[{x,y,radius},{x:x+17,y,radius}];
 const modes=[{name:"clear",s:2.1,contrast:200},{name:"faint",s:1.5,contrast:90},{name:"low",s:1.05,contrast:135}];
 const cases=[
 {name:"new-pair-with-label",scan:row(110,120),label:"left",trueRow:true},
 {name:"new-pair-without-label",scan:row(110,120),trueRow:true},
 {name:"new-text-like-pair",scan:row(110,120),trueRow:false},
 {name:"new-number-like-decorative-pair",scan:row(110,120),label:"left",trueRow:false},
 {name:"stable-unclassified-pair",blank:row(110,120),scan:row(110,120),label:"left",blankLabel:"left",trueRow:false},
 {name:"moved-unclassified-pair",blank:row(110,120),scan:row(110,145),label:"left",blankLabel:"left",trueRow:false},
 {name:"new-pair-two-sided-labels",scan:row(110,120),label:"both",trueRow:true},
 {name:"empty",scan:[],trueRow:false}
 ];
 const result=[];
 for(const mode of modes)for(const c of cases){
  const {s,contrast}=mode,matrix=[s,0,10,0,s,10,0,0,1],w=Math.ceil(page.width*s+20),h=Math.ceil(page.height*s+20);
  function draw(points,label){
   const values=new Uint8Array(w*h).fill(242);
   function paint(x,y,r,fn){let cx=x*s+10,cy=y*s+10;for(let j=Math.max(0,Math.floor(cy-r*s));j<Math.min(h,cy+r*s+1);j++)for(let i=Math.max(0,Math.floor(cx-r*s));i<Math.min(w,cx+r*s+1);i++){let mass=0;for(let a of [-.25,.25])for(let b of [-.25,.25])if(fn((i+a-cx)/s,(j+b-cy)/s))mass+=.25;values[j*w+i]=Math.min(values[j*w+i],Math.round(242-contrast*mass));}}
   for(const p of points)paint(p.x,p.y,5,(x,y)=>Math.abs(Math.hypot(x,y)-radius)<.6);
   if(points.length)for(const side of (label==="both"?["left","right"]:label?[label]:[])){const p=side==="left"?points[0]:points.at(-1),x=p.x+(side==="left"?-13:13);paint(x,p.y,4,(u,v)=>(Math.abs(u)<.45&&Math.abs(v)<2.7)||(v>2.2&&v<3&&Math.abs(u)<1.5)||(v< -1.8&&v> -2.7&&u<0&&u>-1.4));}
   return {width:w,height:h,values};
  }
  function detect(gray){const rings=pageRingCandidates(gray,matrix,page,{minRadius:2,maxRadius:6,markedCenters:true,fineOutlines:true}).filter(p=>circularWitness(gray,matrix,p));return associate(rings).rows.filter(r=>r.choices.length===2)}
  const blank=draw(c.blank??[],c.blankLabel),scan=draw(c.scan,c.label),before=detect(blank),after=detect(scan);
  function labelWitness(r,side){const p=side<0?r.choices[0]:r.choices[1],x=p.x+side*13,y=p.y,ink=[];for(let dy=-4;dy<=4;dy+=.4)for(let dx=-3;dx<=3;dx+=.4){const q=project(matrix,x+dx,y+dy);if(242-grayAt(scan,q.x,q.y)>=32)ink.push([dx,dy]);}if(ink.length<5)return false;let xs=ink.map(p=>p[0]),ys=ink.map(p=>p[1]);return Math.max(...xs)-Math.min(...xs)>=.6&&Math.max(...ys)-Math.min(...ys)>=2.5&&Math.max(...xs)-Math.min(...xs)<=4.5;}
  const observations=after.map(r=>{const prior=before.some(b=>b.choices.length===2&&b.choices.every(p=>r.choices.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<=1.5)));const left=labelWitness(r,-1),right=labelWitness(r,1);return {prior,left,right,status:prior?"previously-observed-unclassified":left!==right?"novel-pair-with-context":"novel-pair-unresolved",semanticAssurance:false};});
  result.push({case:c.name,mode:mode.name,trueRow:c.trueRow,observations,missingPrior:before.filter(b=>!after.some(r=>b.choices.every(p=>r.choices.some(q=>Math.hypot(p.x-q.x,p.y-q.y)<=1.5)))).length});
 }
 return result;
}
console.log(JSON.stringify(run({grayAt,project,pageRingCandidates,circularWitness},associate),null,2));