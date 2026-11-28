// REC-R2: conservative proposals for teacher review, never an authoritative handwriting map.
import { grayAt } from '../omr-image.js';
import { project } from '../projective.js';
const med=a=>{const s=[...a].sort((a,b)=>a-b);return s[Math.floor(s.length/2)]};
const step=.25;
function peaks(samples){
  const out=[];let cluster=[];
  const flush=()=>{if(!cluster.length)return;const best=Math.max(...cluster.map(q=>q.score));const ties=cluster.filter(q=>q.score>=best-.015);out.push({at:ties.reduce((n,q)=>n+q.at,0)/ties.length,score:best});cluster=[]};
  for(const q of samples){if(q.score>=.72)cluster.push(q);else flush()}flush();return out;
}
export function proposeHandwritingBoxes(gray,profile,registration){
 if(registration?.status!=='registered')return {status:'unavailable',items:[]};
 const allBubbles=profile.components.flatMap(b=>b.items.flatMap(i=>i.choices??i.slots.flatMap(s=>s.choices)));
 const results=[];
 for(const block of profile.components.filter(b=>b.kind==='nr'))for(const item of block.items){
  const unavailable=reason=>({id:item.id,status:'unavailable',reason,boxes:[]});
  if(item.slots?.length!==4||item.slots.some(s=>s.choices.length<10)){results.push(unavailable('not-four-digit-columns'));continue}
  const centers=item.slots.map(s=>med(s.choices.map(c=>c.x))),pitch=med(centers.slice(1).map((x,i)=>x-centers[i]));
  if(pitch<9||pitch>45||centers.slice(1).some((x,i)=>Math.abs(x-centers[i]-pitch)>pitch*.12)||
      item.slots.some((s,i)=>s.choices.some(c=>Math.abs(c.x-centers[i])>1.1))){results.push(unavailable('unsupported-column-geometry'));continue}
  const first=Math.min(...item.slots.flatMap(s=>s.choices.map(c=>c.y-c.radius)));
  const matrix=registration.refinedBlocks?.find(b=>b.id===block.id)?.matrix??registration.pageToSource;
  const sample=(x,y)=>{const p=project(matrix,x,y);return p?grayAt(gray,p.x,p.y):NaN};
  const strength=(x,y,horizontal)=>{
    const v=sample(x,y),a=sample(x+(horizontal?0:1.4),y+(horizontal?1.4:0)),b=sample(x-(horizontal?0:1.4),y-(horizontal?1.4:0));
    return Number.isFinite(v)&&Number.isFinite(a)&&Number.isFinite(b)&&Math.min(a,b)-v>=22;
  };
  const support=(cx,y,half)=>{let hits=0,n=0;for(let dx=-half;dx<=half+.001;dx+=.5){n++;hits+=Number(strength(cx+dx,y,true))}return hits/n};
  const rows=[];
  for(let y=Math.max(1,first-43);y<=first-1;y+=step)rows.push({at:y,score:Math.min(...centers.map(x=>support(x,y,pitch*.25)))});
  const horizontal=peaks(rows);
  if(horizontal.length>10){results.push(unavailable('too-many-lines'));continue}
  const possibilities=[];
  for(const top of horizontal)for(const bottom of horizontal){
   const height=bottom.at-top.at;if(height<6||height>26)continue;
   const boxes=[];let failed=false;
   for(const [i,cx] of centers.entries()){
    function vertical(side){
      const samples=[];
      for(let d=pitch*.27;d<=pitch*.57;d+=step){
        const x=cx+side*d;let hits=0,n=0;
        for(let y=top.at+height*.2;y<=bottom.at-height*.2;y+=.5){n++;hits+=Number(strength(x,y,false))}
        samples.push({at:x,score:hits/n});
      }
      const lines=peaks(samples);return lines.length===1?lines[0]:null;
    }
    const l=vertical(-1),r=vertical(1);
    if(!l||!r||r.at-l.at<5||Math.abs((r.at+l.at)/2-cx)>pitch*.13){failed=true;break}
    const box={id:item.slots[i].id,x:l.at,y:top.at,width:r.at-l.at,height};
    if(box.x<0||box.y<0||box.x+box.width>profile.page.width||box.y+box.height>profile.page.height||
       allBubbles.some(b=>Math.hypot(b.x-Math.max(box.x,Math.min(b.x,box.x+box.width)),b.y-Math.max(box.y,Math.min(b.y,box.y+box.height)))<=b.radius)){
      failed=true;break;
    }
    // Closed frames in a teacher-confirmed blank should have mostly clear interiors.
    const inner=[];for(let a=1;a<=5;a++)for(let b=1;b<=5;b++)inner.push(sample(box.x+box.width*a/6,box.y+height*b/6));
    if(inner.some(v=>!Number.isFinite(v))||inner.filter(v=>v<med(inner)-40).length>3){failed=true;break}
    boxes.push(box);
   }
   if(failed||boxes.some((b,i)=>i>0&&boxes[i-1].x+boxes[i-1].width>b.x+.6))continue;
   possibilities.push(boxes);
  }
  if(possibilities.length!==1){results.push(unavailable(possibilities.length?'competing-box-rows':'no-complete-frame'));continue}
  results.push({id:item.id,status:'proposed',boxes:possibilities[0],teacherConfirmationRequired:true});
 }
 return {status:'evaluated',items:results};
}
