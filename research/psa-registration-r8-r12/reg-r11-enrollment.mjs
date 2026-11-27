import {grayAt} from '../../app/src/omr-image.js';
import {project} from '../../app/src/projective.js';
import {enrollAdaptiveMcPrint} from '../../app/src/psa-registration/mc-same-print.js';
function locateComponents(gray,matrix,profile,api){
 const {grayAt,project}=api,step=.4,sample=(x,y)=>{let p=project(matrix,x,y);return p?grayAt(gray,p.x,p.y):NaN};
 function regions(x,y,rx,ry){
   const w=Math.floor(rx*2/step)+1,h=Math.floor(ry*2/step)+1,v=Array.from({length:w*h},(_,i)=>sample(x-rx+(i%w)*step,y-ry+Math.floor(i/w)*step));if(v.some(t=>!Number.isFinite(t)))return [];
   const bg=[...v].sort((a,b)=>a-b)[Math.floor(v.length*.85)],seen=new Uint8Array(v.length),out=[];
   for(let i=0;i<v.length;i++){if(seen[i]||bg-v[i]<42)continue;const q=[i];seen[i]=1;let l=w,r=0,t=h,b=0;for(let j=0;j<q.length;j++){let a=q[j]%w,z=Math.floor(q[j]/w);l=Math.min(l,a);r=Math.max(r,a);t=Math.min(t,z);b=Math.max(b,z);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let u=a+dx,k=z+dy,n=k*w+u;if(u>=0&&u<w&&k>=0&&k<h&&!seen[n]&&bg-v[n]>=42){seen[n]=1;q.push(n)}}}
   const width=(r-l+1)*step,height=(b-t+1)*step;
   if(l===0||t===0||r===w-1||b===h-1||width<.65||width>8||height<2.7||height>8.5||q.length<8)continue;
   out.push({x:x-rx+(l+r)*step/2,y:y-ry+(t+b)*step/2,width,height});
   }
   return out;
 }
 const result=[];
 for(const block of profile.components){const rows=block.items,first=rows[0].choices,pitch=first[1].x-first[0].x;
  // Segment local candidate components first, then require a coherent group.
  const heads=first.map(c=>regions(c.x,c.y-pitch*.9,pitch*.42,pitch*.72));
  const groups=[];
  for(const anchor of heads.flat()) {
   const selected=heads.map(a=>a.filter(b=>Math.abs(b.y-anchor.y)<=1.15&&b.height/anchor.height>.65&&b.height/anchor.height<1.55));
   if(selected.every(a=>a.length===1)){
    const sites=selected.map((a,i)=>({...a[0],kind:"header",block:block.id,symbol:first[i].symbol}));
    if(!groups.some(g=>g.every((p,i)=>Math.hypot(p.x-sites[i].x,p.y-sites[i].y)<.5)))groups.push(sites);
   }
  }
  if(groups.length===1)result.push(...groups[0]);
  // Merge adjacent digit-size components into a token, then require all row windows
  // on exactly one side. This observes ink only, not the token's semantic identity.
  const sides=[-1,1].map(side=>rows.map(row=>{
   const c=side<0?row.choices[0]:row.choices.at(-1),a=regions(c.x+side*pitch,c.y,pitch*.56,7).sort((a,b)=>a.x-b.x);
   if(!a.length||a.length>3||Math.max(...a.map(p=>p.y))-Math.min(...a.map(p=>p.y))>1.6)return null;
   if(a.slice(1).some((p,i)=>p.x-a[i].x>(p.width+a[i].width)/2+2))return null;
   const left=a[0].x-a[0].width/2,right=a.at(-1).x+a.at(-1).width/2;
   if(right-left>11.5)return null;
   return {x:(left+right)/2,y:a.reduce((s,p)=>s+p.y,0)/a.length,kind:"number",block:block.id,symbol:row.id};
  })).filter(s=>s.every(Boolean)&&Math.max(...s.map(p=>p.x))-Math.min(...s.map(p=>p.x))<=4);
  if(sides.length===1)result.push(...sides[0]);
 }
 return result.filter(s=>!profile.components.some(b=>b.items.some(i=>i.choices.some(c=>Math.hypot(Math.max(0,Math.abs(c.x-s.x)-(s.kind==="number"?6:4.25)),Math.max(0,Math.abs(c.y-s.y)-4.25))<=c.radius))));
}
function run(api,locate){
 const page={width:240,height:260},ids=["11","12","13","14"],modes=[{scale:2.5,contrast:205},{scale:1.25,contrast:130},{scale:2,contrast:70}],glyphs={A:["01110","10001","10001","11111","10001","10001","10001"],B:["11110","10001","10001","11110","10001","10001","11110"],C:["01111","10000","10000","10000","10000","10000","01111"],D:["11110","10001","10001","10001","10001","10001","11110"],"1":["00100","01100","00100","00100","00100","00100","01110"],"2":["01110","10001","00001","00010","00100","01000","11111"],"3":["11110","00001","00001","01110","00001","00001","11110"],"4":["00010","00110","01010","10010","11111","00010","00010"]};
 const cases=[{name:"ordinary"},{name:"dense-small-print",small:true},{name:"dense-number-side",small:true,right:true},{name:"competing-headers",double:true},{name:"two-sided-numbers",two:true},{name:"missing-headers",missing:true},{name:"fused-header-text",fused:true},{name:"tight-pitch",pitch:9,small:true}];
 const records=[];
 for(const c of cases)for(const mode of modes){
 const pitch=c.pitch??17,rows=ids.map((id,i)=>({id,choices:[..."ABCD"].map((symbol,j)=>({symbol,x:80+j*pitch,y:100+i*16,radius:3,provenance:"observed"}))}));
 const profile={page,components:[{kind:"mc",id:"b",items:rows}]},scale=mode.scale,matrix=[scale,0,5,0,scale,5,0,0,1],width=Math.ceil(page.width*scale+10),height=Math.ceil(page.height*scale+10),values=new Uint8Array(width*height).fill(242),truth=[];
 const rect=(x,y,w,h)=>{for(let j=Math.ceil(y*scale+5);j<(y+h)*scale+5;j++)for(let i=Math.ceil(x*scale+5);i<(x+w)*scale+5;i++)values[j*width+i]=Math.max(0,242-mode.contrast)};
 function print(text,x,y){let cell=.72,gap=.75,total=text.length*5*cell+(text.length-1)*gap;for(let n=0;n<text.length;n++)for(let j=0;j<7;j++)for(let i=0;i<5;i++)if(glyphs[text[n]][j][i]==="1")rect(x-total/2+n*(5*cell+gap)+i*cell,y-3.5*cell+j*cell,cell+.08,cell+.08)}
 for(const [i,row] of rows.entries()){
  for(const p of row.choices){for(let y=Math.floor((p.y-4)*scale+5);y<(p.y+4)*scale+5;y++)for(let x=Math.floor((p.x-4)*scale+5);x<(p.x+4)*scale+5;x++)if(Math.abs(Math.hypot((x-5)/scale-p.x,(y-5)/scale-p.y)-3)<.5)values[y*width+x]=242-mode.contrast}
  const x=c.right?row.choices.at(-1).x+pitch:row.choices[0].x-pitch,y=row.choices[0].y;print(row.id,x,y);if(c.two)print(row.id,row.choices.at(-1).x+pitch,y);else truth.push({kind:"number",symbol:row.id,x,y});
  if(c.small)rect(x-4,y-5.5,7,.6);
 }
 for(const p of rows[0].choices){const x=p.x,y=p.y-pitch*.9;if(!c.missing){print(p.symbol,x,y);if(c.double)print(p.symbol,x,y-9);else if(!c.fused)truth.push({kind:"header",symbol:p.symbol,x,y});if(c.small)rect(x-4,y-5.5,8,.6);if(c.fused)rect(x-5,y-1,10,2)}}
 const gray={width,height,values},old=api.enrollAdaptiveMcPrint(gray,matrix,profile),newSites=locate(gray,matrix,profile,api);
 const report=sites=>({enrolled:sites.length,correct:truth.filter(t=>sites.some(s=>s.symbol===t.symbol&&s.kind===t.kind&&Math.hypot(s.x-t.x,s.y-t.y)<=1.5)).length,unverified:sites.filter(s=>!truth.some(t=>s.symbol===t.symbol&&s.kind===t.kind&&Math.hypot(s.x-t.x,s.y-t.y)<=1.5)).length});
 records.push({case:c.name,scale,contrast:mode.contrast,expected:truth.length,baseline:report(old),segmented:report(newSites)});
 }
 return records;
}
console.log(JSON.stringify(run({grayAt,project,enrollAdaptiveMcPrint},locateComponents),null,2));
