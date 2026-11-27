import {project,invertProjective} from '../../app/src/projective.js';
import {toGrayImage} from '../../app/src/omr-image.js';
import {createMarkerlessProfile} from '../../app/src/profile-authoring.js';
import {readProfileSheet} from '../../app/src/profile-omr.js';
import {observeOutlines,outlinePoseProposals} from '../../app/src/bubble-registration.js';





function run(api){
 const {project,invertProjective,toGrayImage,createMarkerlessProfile,readProfileSheet,observeOutlines,outlinePoseProposals}=api;
 const page={width:612,height:792,units:"pt",origin:"top-left",orientation:"portrait"};
 const blocks=[[100,150,4,20,19],[350,320,5,18,20],[125,590,3,22,20]].map(([x,y,n,dx,dy],b)=>({id:"block"+b,kind:"mc",bounds:{x:x-8,y:y-8,width:(n-1)*dx+16,height:2*dy+16},items:Array.from({length:3},(_,i)=>({id:"q"+b+"-"+i,kind:"mc",bounds:{x:x-6,y:y+i*dy-6,width:(n-1)*dx+12,height:12},choices:Array.from({length:n},(_,j)=>({x:x+j*dx,y:y+i*dy,radius:4,symbol:"ABCDE"[j],provenance:"observed"}))}))}));
 const profile=createMarkerlessProfile({id:"pose-study",name:"Synthetic pose study",revision:1,page,components:blocks}),batch={profileId:profile.id,revision:1};
 const sites=blocks.flatMap(b=>b.items.flatMap(i=>i.choices)),pt=(x,y)=>({x,y});
 const cases=[{name:"adjacent-extra",m:[1,0,25,0,1,25,0,0,1],w:670,h:850,extra:true,valid:false},{name:"rotated-adjacent-extra",m:[0,-1,818,1,0,22,0,0,1],w:846,h:660,extra:true,valid:false},{name:"low-faint-valid",m:[.55,0,18,0,.55,15,0,0,1],w:380,h:470,faint:true,valid:true},
 {name:"upright",m:[1,0,25,0,1,25,0,0,1],w:670,h:850,valid:true},
 {name:"projective",m:[1.03,.07,22,.03,1.02,18,.00009,.00012,1],w:720,h:850,valid:true},
 {name:"quarter-turn",m:[0,-1,818,1,0,22,0,0,1],w:846,h:660,valid:true},
 {name:"cropped-border",m:[1,0,-48,0,1,-55,0,0,1],w:540,h:705,valid:true},
 {name:"low-resolution",m:[.69,0,20,0,.69,18,0,0,1],w:470,h:590,valid:true},
 {name:"missing-row",m:[1,0,25,0,1,25,0,0,1],w:670,h:850,missing:true,valid:false},
 {name:"mirror",m:[-1,0,640,0,1,25,0,0,1],w:670,h:850,valid:false},
 {name:"wrong-batch",m:[1,0,25,0,1,25,0,0,1],w:670,h:850,wrong:true,valid:false}
 ];
 const results=[];
 for(const c of cases){
  const inv=invertProjective(c.m),pixels=new Uint8ClampedArray(c.w*c.h*4),corners=[pt(0,0),pt(612,0),pt(612,792),pt(0,792)].map(p=>project(c.m,p.x,p.y));
  for(let y=0;y<c.h;y++)for(let x=0;x<c.w;x++){let q=project(inv,x,y),v=q&&q.x>=0&&q.x<=612&&q.y>=0&&q.y<=792?239:95,k=(y*c.w+x)*4;pixels[k]=pixels[k+1]=pixels[k+2]=v;pixels[k+3]=255}
  const rendered=c.missing?sites.slice(4):c.extra?[...sites,...sites.slice(0,4).map(p=>({...p,y:p.y+57}))]:sites;
  for(const p of rendered){const q=project(c.m,p.x,p.y);for(let y=Math.max(0,Math.floor(q.y-8));y<Math.min(c.h,q.y+9);y++)for(let x=Math.max(0,Math.floor(q.x-8));x<Math.min(c.w,q.x+9);x++){let v=0;for(let dy of [-.25,.25])for(let dx of [-.25,.25]){let k=project(inv,x+dx,y+dy);if(Math.abs(Math.hypot(k.x-p.x,k.y-p.y)-p.radius)<.65)v+=.25}if(v){const i=(y*c.w+x)*4;pixels[i]=pixels[i+1]=pixels[i+2]=Math.round(239-(c.faint?70:215)*v)}}}
  const image={id:c.name,width:c.w,height:c.h,pixels},options={batch:c.wrong?{profileId:"wrong",revision:1}:batch};
  const auto=readProfileSheet(image,profile,options),manual=readProfileSheet(image,profile,{...options,corners});
  const maxError=m=>Math.max(...sites.map(p=>{const a=project(m,p.x,p.y),b=project(c.m,p.x,p.y);return a&&b?Math.hypot(a.x-b.x,a.y-b.y):Infinity}));
  let diagnostic={attempted:false};
  // On valid auto failures only: inspect existing outline hypotheses separately.
  // Oracle used solely to score candidates, never to select a real scan pose.
  if(auto.status!=="read"&&auto.registration.reasons.every(x=>["response-geometry","page-corners"].includes(x))){
   const gray=toGrayImage(image),available=observeOutlines(gray,page);
   const candidates=available?outlinePoseProposals(gray,profile,1,0,available):[];
   const scored=candidates.map(p=>({mirrored:p.mirrored,error:maxError(p.transform),heldOut:p.witnesses.heldOut,maxHeldOut:p.witnesses.maxHeldOutErrorPx,fitCoverage:p.witnesses.fitCoverage}));
   const reliable=candidates.filter(p=>p.witnesses.heldOut>=4&&p.witnesses.maxHeldOutErrorPx<=1.4&&[p.witnesses.fitCoverage,p.witnesses.heldOutCoverage].every(q=>q.width>=.27&&q.height>=.27));
   const distinct=[];for(const p of reliable){if(!distinct.some(q=>q.mirrored===p.mirrored&&sites.every(c=>{const a=project(q.transform,c.x,c.y),b=project(p.transform,c.x,c.y);return a&&b&&Math.hypot(a.x-b.x,a.y-b.y)<2})))distinct.push(p)}
   const selected=distinct.length===1&&!distinct[0].mirrored?distinct[0]:null;
   diagnostic={attempted:true,observed:available?.observed.length??0,count:scored.length,oracleNear:scored.filter(p=>!p.mirrored&&p.error<2).length,mirrorCandidates:scored.filter(p=>p.mirrored).length,distinct:distinct.length,proposed:!!selected,proposedError:selected?maxError(selected.transform):null,scored};
 
  }
  const report=r=>({status:r.status,reasons:r.registration.reasons,path:r.registration.cornerPath??r.registration.diagnostics?.pagePose?.path??null,error:r.status==="read"?maxError(r.registration.pageToSource):null,items:r.items.length});
  results.push({name:c.name,valid:c.valid,auto:report(auto),manual:report(manual),diagnostic});
 }
 return results;
}


console.log(JSON.stringify(run({project,invertProjective,toGrayImage,createMarkerlessProfile,readProfileSheet,observeOutlines,outlinePoseProposals}),null,2));