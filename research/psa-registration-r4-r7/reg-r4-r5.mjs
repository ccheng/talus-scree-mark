// REG-R4/R5 synthetic page-raster ablation. Run: node research/psa-registration-r4-r7/reg-r4-r5.mjs
import {grayAt} from '../../app/src/omr-image.js';
import {project,invertProjective,fitProjectiveSamples} from '../../app/src/projective.js';
import {pageRingCandidates} from '../../app/src/profile-authoring.js';
import {enrollMcPrint,compareMcPrint} from '../../app/src/psa-registration/mc-same-print.js';
function run(api){
 const {grayAt,project,invertProjective,fitProjectiveSamples,pageRingCandidates,enrollMcPrint,compareMcPrint}=api;
 const glyphs={
 A:[[[0,1],[.5,0],[1,1]],[[.23,.58],[.77,.58]]],
 B:[[[0,1],[0,0],[.62,0],[.98,.18],[.85,.42],[.55,.49],[0,.49]],[[.55,.49],[.95,.65],[.98,.82],[.72,1],[0,1]]],
 C:[[[1,.14],[.72,0],[.25,0],[0,.25],[0,.75],[.25,1],[.75,1],[1,.86]]],
 D:[[[0,1],[0,0],[.65,0],[1,.25],[1,.75],[.65,1],[0,1]]],
 K:[[[0,0],[0,1]],[[1,0],[0,.54],[1,1]]],
 X:[[[0,0],[1,1]],[[1,0],[0,1]]],
 "0":[[[.22,0],[.78,0],[1,.22],[1,.78],[.78,1],[.22,1],[0,.78],[0,.22],[.22,0]]],
 "1":[[[.15,.25],[.5,0],[.5,1]],[[.12,1],[.88,1]]],
 "2":[[[0,.2],[.2,0],[.8,0],[1,.22],[.82,.48],[0,1],[1,1]]],
 "3":[[[0,0],[.9,0],[1,.24],[.6,.5],[1,.73],[.84,1],[0,1]]],
 "4":[[[.7,1],[.7,0],[0,.67],[1,.67]]],
 "7":[[[0,0],[1,0],[.35,1]]],
 "8":[[[.2,0],[.8,0],[1,.22],[.78,.48],[.2,.52],[0,.76],[.2,1],[.8,1],[1,.76],[.8,.52],[.22,.48],[0,.22],[.2,0]]],
 "9":[[[.9,1],[1,.15],[.8,0],[.2,0],[0,.2],[.2,.52],[.8,.52],[1,.3]]]
 };
 const page={width:280,height:310};const matrix=[2.5,0,12,0,2.5,12,0,0,1];
 const mult=(a,b)=>Array.from({length:9},(_,i)=>{const r=Math.floor(i/3),c=i%3;return a[3*r]*b[c]+a[3*r+1]*b[3+c]+a[3*r+2]*b[6+c]});
 const layouts=[{name:"left-normal",side:"left",font:0,headerDx:0,headerDy:0,ids:["1","2","3","4"]},{name:"right-multidigit",side:"right",font:1,headerDx:1.3,headerDy:2,ids:["10","11","12","13"]},{name:"left-offset-multidigit",side:"left",font:2,headerDx:-1.4,headerDy:3.5,ids:["17","18","19","20"]}];
 const box=(x,y,w,h)=>({x,y,width:w,height:h});
 function profile(layout){
   return {page,components:[{kind:"mc",id:"mc",bounds:box(40,65,190,115),items:layout.ids.map((id,i)=>({id,kind:"mc",choices:[..."ABCD"].map((symbol,j)=>({symbol,x:100+j*20,y:95+i*22,radius:4.4,provenance:"observed"}))}))}]};
 }
 function centers(layout,p){
   const choices=p.components[0].items[0].choices;
   const h=choices.map(c=>({kind:"header",block:"mc",symbol:c.symbol,x:c.x+layout.headerDx,y:c.y-18+layout.headerDy}));
   const n=p.components[0].items.map(i=>({kind:"number",block:"mc",symbol:i.id,x:layout.side==="left"?i.choices[0].x-20:i.choices.at(-1).x+20,y:i.choices[0].y}));
   return [...n,...h];
 }
 function dseg(x,y,a,b){const u=b[0]-a[0],v=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*u+(y-a[1])*v)/(u*u+v*v||1)));return Math.hypot(x-a[0]-t*u,y-a[1]-t*v);}
 function glyphInk(text,x,y,font,kind){
   const h=kind==="number"?6.3:6.5,w=kind==="number"?3.3:4.5,space=.9,total=text.length*w+(text.length-1)*space;
   const width=font===1?.50:font===2?.40:.39;const slope=font===1?.14:font===2?-.10:0;
   let best=Infinity;
   for(let i=0;i<text.length;i++){const strokes=glyphs[text[i]]??[];const ox=-total/2+i*(w+space);for(const poly of strokes)for(let k=1;k<poly.length;k++){
     const pt=a=>[ox+a[0]*w+slope*(a[1]-.5)*h,(a[1]-.5)*h];best=Math.min(best,dseg(x,y,pt(poly[k-1]),pt(poly[k])));
   }}
   return best<=width;
 }
 const modes=[
   {name:"normal",pose:[2.15,0,16,0,2.15,16,0,0,1],warp:[1,0,0,0,1,0,0,0,1],contrast:205,noise:3},
   {name:"oblique-local-error",pose:[2.1,.18,14,.12,1.95,18,.00012,.0002,1],warp:[1.007,.011,-.4,-.008,1.006,1.3,0,0,1],contrast:175,noise:7},
   {name:"quarter-turn",pose:[0,-1.9,620,1.9,0,20,0,0,1],warp:[1,.004,-.25,-.004,1,.7,0,0,1],contrast:190,noise:6}
 ];
 function draw(layout,p,sites,mode,condition){
   const width=740,height=820,m=mult(mode.pose,mode.warp),inv=invertProjective(m),values=new Uint8Array(width*height);
   let seed=1234;for(let y=0;y<height;y++)for(let x=0;x<width;x++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;values[y*width+x]=Math.round(240-15*x/width+mode.noise*(seed/4294967296-.5))}
   function ink(cx,cy,fn,erase=false){
     const src=project(m,cx,cy);const rr=22;
     for(let y=Math.max(0,Math.floor(src.y-rr));y<Math.min(height,src.y+rr+1);y++)for(let x=Math.max(0,Math.floor(src.x-rr));x<Math.min(width,src.x+rr+1);x++){
       let ink=0;for(const dx of [-.3,.3])for(const dy of [-.3,.3]){const q=project(inv,x+dx,y+dy);if(q&&fn(q.x-cx,q.y-cy))ink+=.25}
       const k=y*width+x;values[k]=erase?Math.min(242,Math.round(values[k]+ink*mode.contrast*.8)):Math.max(0,Math.round(values[k]-ink*mode.contrast));
     }
   }
   for(const item of p.components[0].items)for(const c of item.choices)ink(c.x,c.y,(x,y)=>Math.abs(Math.hypot(x,y)-c.radius)<.52);
   for(const site of sites){
     let text=site.symbol;if(condition==="B-to-K"&&site.kind==="header"&&text==="B")text="K";
     if(condition==="number-change"&&site.kind==="number"&&text===layout.ids[1])text=text.length===1?"7":text[0]+"7";
     ink(site.x,site.y,(x,y)=>glyphInk(text,x,y,layout.font,site.kind));
     if(site.kind==="header"&&site.symbol==="B"){
       if(condition==="scribble")ink(site.x,site.y,(x,y)=>Math.abs(y-.35*x-.5)<.5&&Math.abs(x)<3.5);
       if(condition==="erase")ink(site.x,site.y,(x,y)=>x>.15&&Math.abs(y)<2.8&&x<3.8,true);
     }
   }
   return {gray:{width,height,values},oracle:m};
 }
 function sample(g,m,x,y){const p=project(m,x,y);return p?grayAt(g,p.x,p.y):NaN}
 // Reproduce the LSDE public comparator's reference patch shape from oracle
 // windows, without modifying the comparator or using its private functions.
 function reference(gray,m,site){
   const cols=site.kind==="header"?35:49,rows=35,step=.25,rx=(cols-1)*step/2,ry=(rows-1)*step/2;
   const corners=[-1,1].flatMap(x=>[-1,1].map(y=>sample(gray,m,site.x+x*(rx+1.25),site.y+y*(ry+1.25)))).sort((a,b)=>a-b);
   const background=(corners[1]+corners[2])/2;const values=[];
   for(let y=0;y<rows;y++)for(let x=0;x<cols;x++)values.push(Math.max(0,Math.min(255,Math.round(background-sample(gray,m,site.x+x*step-rx,site.y+y*step-ry)))));
   return {...site,reference:values,pixelsPerPoint:2.5};
 }
 // Alternative bounded label locator: both sides, consistent column of tokens.
 // It detects ink regions, not OCR identity; unknown/ambiguous side stays unavailable.
 function locateInk(g,m,x,y,rx,ry){
   const bg=[[-rx,-ry],[-rx,ry],[rx,-ry],[rx,ry]].map(([dx,dy])=>sample(g,m,x+dx,y+dy)).sort((a,b)=>a-b);const level=(bg[1]+bg[2])/2;
   const pts=[];for(let dy=-ry;dy<=ry;dy+=.25)for(let dx=-rx;dx<=rx;dx+=.25)if(level-sample(g,m,x+dx,y+dy)>65)pts.push([dx,dy]);
   if(pts.length<16)return null;const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),l=Math.min(...xs),r=Math.max(...xs),t=Math.min(...ys),b=Math.max(...ys);
   if(l<-rx+.5||r>rx-.5||t<-ry+.5||b>ry-.5||r-l<.5||b-t<2.5||r-l>12||b-t>10)return null;
   return {x:x+(l+r)/2,y:y+(t+b)/2,width:r-l,height:b-t};
 }
 function alternateSites(gray,m,p){
   const block=p.components[0],rows=block.items,first=rows[0].choices,pitch=first[1].x-first[0].x;
   const sides=["left","right"].map(side=>({side,sites:rows.flatMap(row=>{
     const endpoint=side==="left"?row.choices[0]:row.choices.at(-1);
     const loc=locateInk(gray,m,endpoint.x+(side==="left"?-pitch:pitch),endpoint.y,pitch*.60,7);
     return loc?[{kind:"number",block:block.id,symbol:row.id,...loc}]:[];
   })})).filter(s=>s.sites.length>=Math.ceil(rows.length*.75));
   const number=sides.length===1?sides[0].sites:[];
   const header=first.flatMap(c=>{const loc=locateInk(gray,m,c.x,c.y-.9*pitch,pitch*.4,7);return loc?[{kind:"header",block:block.id,symbol:c.symbol,...loc}]:[]});
   return [...number,...header].map(s=>reference(gray,m,s));
 }
 // Fit bounded local projective correction to independently observed bubble
 // centers, not to the glyph being checked; holdout anchors guard the fit.
 function independentlyCorrect(gray,nominal,p){
   const choices=p.components[0].items.flatMap(r=>r.choices);
   const rings=pageRingCandidates(gray,nominal,p.page,{minRadius:3,maxRadius:6.5,markedCenters:true,fineOutlines:true,limit:400});
   const pairs=choices.flatMap(c=>{const hits=rings.filter(r=>Math.hypot(c.x-r.x,c.y-r.y)<=3.6);return hits.length===1?[{src:c,dst:hits[0]}]:[]});
   if(pairs.length<12)return {matrix:nominal,status:"insufficient",matched:pairs.length};
   const training=pairs.filter((_,i)=>i%4!==2),hold=pairs.filter((_,i)=>i%4===2);
   const fit=fitProjectiveSamples(training.map(p=>p.src),training.map(p=>p.dst));
   if(!fit)return {matrix:nominal,status:"degenerate",matched:pairs.length};
   const err=hold.map(({src,dst})=>{const q=project(fit,src.x,src.y);return q?Math.hypot(q.x-dst.x,q.y-dst.y):Infinity});
   const maxError=Math.max(...err);const bounds=choices.concat([{x:75,y:70},{x:190,y:165}]);
   if(maxError>.9||bounds.some(c=>{const q=project(fit,c.x,c.y);return !q||Math.hypot(q.x-c.x,q.y-c.y)>3.6}))return {matrix:nominal,status:"unbounded-or-disagreement",matched:pairs.length,maxError};
   return {matrix:mult(nominal,fit),status:"corrected",matched:pairs.length,maxError};
 }
 const results=[],enrollments=[];
 for(const l of layouts){
   const p=profile(l),sites=centers(l,p),blank=draw(l,p,sites,{pose:matrix,warp:[1,0,0,0,1,0,0,0,1],contrast:220,noise:2},"unchanged").gray;
   const baseline=enrollMcPrint(blank,matrix,p),oracle=sites.map(s=>reference(blank,matrix,s)),alternate=alternateSites(blank,matrix,p);
   const count=arr=>({header:arr.filter(s=>s.kind==="header").length,number:arr.filter(s=>s.kind==="number").length});
   enrollments.push({layout:l.name,baseline:count(baseline),oracle:count(oracle),alternate:count(alternate),numberLocations:alternate.filter(s=>s.kind==="number").map(s=>({symbol:s.symbol,x:s.x,y:s.y}))});
   for(const mode of modes)for(const condition of ["unchanged","B-to-K","number-change","scribble","erase"]){
     const {gray,oracle:actual}=draw(l,p,sites,mode,condition),correction=independentlyCorrect(gray,mode.pose,p);
     const variants={baseline:compareMcPrint(gray,{pageToSource:mode.pose},baseline),
       oracleWindow:compareMcPrint(gray,{pageToSource:mode.pose},oracle),
       oracleWindowPose:compareMcPrint(gray,{pageToSource:actual},oracle),
       alternateWindow:compareMcPrint(gray,{pageToSource:mode.pose},alternate),
       alternateIndependentPose:compareMcPrint(gray,{pageToSource:correction.matrix},alternate)};
     const target=condition==="number-change"?{kind:"number",symbol:l.ids[1]}:{kind:"header",symbol:"B"};
     const score=arr=>{const t=arr.find(s=>s.kind===target.kind&&s.symbol===target.symbol);return {status:t?.status??"unavailable",distance:t?.distance??null,otherMismatch:arr.filter(s=>!(s.kind===target.kind&&s.symbol===target.symbol)&&s.status==="mismatch").length,available:arr.length}};
     results.push({layout:l.name,mode:mode.name,condition,pose:{status:correction.status,matched:correction.matched,maxError:correction.maxError??null},...Object.fromEntries(Object.entries(variants).map(([k,v])=>[k,score(v)]))});
   }
 }
 const keys=["baseline","oracleWindow","oracleWindowPose","alternateWindow","alternateIndependentPose"];
 const summaries={};for(const key of keys){summaries[key]={};for(const condition of ["unchanged","B-to-K","number-change","scribble","erase"]){const r=results.filter(r=>r.condition===condition);summaries[key][condition]={total:r.length,mismatch:r.filter(r=>r[key].status==="mismatch").length,agreement:r.filter(r=>r[key].status==="agreement").length,unavailable:r.filter(r=>!["agreement","mismatch"].includes(r[key].status)).length,otherMismatch:r.reduce((a,b)=>a+b[key].otherMismatch,0)};}}
 return {note:"PSA synthetic vector glyphs rendered into page rasters; not original ISTE cases. Pinned LSDE enrollMcPrint and compareMcPrint executed; number threshold remains exploratory. Same-print score not identity certificate.",count:results.length,enrollments,summaries,poseCounts:Object.fromEntries([...new Set(results.map(r=>r.pose.status))].map(s=>[s,results.filter(r=>r.pose.status===s).length])),results};
}
console.log(JSON.stringify(run({grayAt,project,invertProjective,fitProjectiveSamples,pageRingCandidates,enrollMcPrint,compareMcPrint}),null,2));
