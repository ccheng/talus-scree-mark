// Research-only evidence helpers; coordinates in saved page points.
const cells=i=>i.kind==='mc'?i.choices:i.slots.flatMap(s=>s.choices);
const inside=(p,r)=>p.x>=r.x&&p.x<=r.x+r.width&&p.y>=r.y&&p.y<=r.y+r.height;
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
export function patch(sample,x,y,rx,ry,step=.5){
 const bg=median([sample(x-rx-1,y-ry-1),sample(x+rx+1,y-ry-1),sample(x-rx-1,y+ry+1),sample(x+rx+1,y+ry+1)]);
 const data=[];for(let v=-ry;v<=ry+1e-8;v+=step)for(let u=-rx;u<=rx+1e-8;u+=step){const a=sample(x+u,y+v);if(!Number.isFinite(a)||!Number.isFinite(bg))return null;data.push(Math.max(0,Math.min(1,(bg-a)/Math.max(50,bg-20))));}return data;
}
function inkCentroid(sample,x,y,rx,ry){
 const p=patch(sample,x,y,rx,ry);if(!p)return null;let mass=0,k=0,minX=Infinity,maxX=-Infinity,minY=Infinity,maxY=-Infinity;
 for(let v=-ry;v<=ry+1e-8;v+=.5)for(let u=-rx;u<=rx+1e-8;u+=.5){const z=p[k++];if(z<.35)continue;mass+=z;minX=Math.min(minX,u);maxX=Math.max(maxX,u);minY=Math.min(minY,v);maxY=Math.max(maxY,v);}
 if(mass<6||maxX-minX<1||maxY-minY<2||minX<=-rx||maxX>=rx||minY<=-ry||maxY>=ry)return null;
 return {x:x+(minX+maxX)/2,y:y+(minY+maxY)/2,mass};
}
export function enrollSemanticSites(profile,sample){
 const result=[],all=profile.components.flatMap(b=>b.items.flatMap(cells)),excluded=p=>(profile.exclusions??[]).some(r=>inside(p,r));
 function add(kind,block,item,symbol,p,rx,ry,group){
  if(!p||excluded(p)||p.x-rx-1<0||p.y-ry-1<0||p.x+rx+1>profile.page.width||p.y+ry+1>profile.page.height)return;
  if(kind==='number'||kind==='header'){if(all.some(a=>Math.hypot(Math.max(0,Math.abs(a.x-p.x)-rx),Math.max(0,Math.abs(a.y-p.y)-ry))<a.radius+1))return;}
  const data=patch(sample,p.x,p.y,rx,ry);if(!data)return;result.push({kind,block,item,symbol,x:p.x,y:p.y,rx,ry,group,data});
 }
 for(const b of profile.components){
  if(b.kind==='mc'){
   const rows=b.items.map(i=>({item:i,choices:[...i.choices].sort((a,b)=>a.x-b.x)})).sort((a,b)=>a.choices[0].y-b.choices[0].y);
   if(!rows.length)continue;const first=rows[0].choices,spacing=first.length>1?median(first.slice(1).map((a,i)=>a.x-first[i].x)):18;
   // Conventional left labels and top headers only; enrollment does not certify OCR.
   for(const {item,choices} of rows){const c=choices[0],p=inkCentroid(sample,c.x-spacing,c.y,Math.min(8,spacing*.45),7);add('number',b.id,item.id,item.id,p,6,4,b.id);}
   for(const c of first){const p=inkCentroid(sample,c.x,c.y-spacing*.9,Math.min(7,spacing*.4),7);add('header',b.id,null,c.symbol,p,3.5,4,b.id);}
  }else for(const i of b.items)for(const s of i.slots)for(const c of s.choices){const p=patch(sample,c.x,c.y,2.3,2.3,.46);if(!p||p.reduce((a,v)=>a+v,0)/p.length<(c.symbol==='.'?.005:.015)||Math.max(...p)<.25)continue;add(c.symbol==='.'?'decimal':'digit',b.id,i.id,c.symbol,c,2.3,2.3,s.id);}
 }
 return result;
}
export function scopeRowDisposition(profile,positions,blankSupports){
 if(positions.every(p=>(profile.exclusions??[]).some(r=>inside(p,r))))return 'excluded';
 if(profile.scope==='mc-only'&&profile.mcCompleteness==='partial'&&blankSupports>=Math.ceil(.75*positions.length))return 'enrolled-print-outside-scope';
 if(profile.scope==='mc-only'&&profile.mcCompleteness==='partial')return 'review-scope-uncertain';
 return 'review-extra-row';
}
export function localAffine(project,H,predict,f,x,y){
 const at=(x,y)=>{const d=predict(f,x,y);return project(H,x+d[0],y+d[1]);};
 const o=at(x,y),a=at(x+1,y),b=at(x,y+1);if(!o||!a||!b)return null;
 const u=a.x-o.x,v=b.x-o.x,w=a.y-o.y,z=b.y-o.y;
 if(![u,v,w,z].every(Number.isFinite)||u*z-v*w<=0)return null;
 return [u,v,o.x-u*x-v*y,w,z,o.y-w*x-z*y,0,0,1];
}
