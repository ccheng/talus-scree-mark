// Run from research/psa-mc inside the pinned app checkout. No network or private data.
import {discoverBlankLayout} from '../../app/src/layout-discovery.js';
const page={width:612,height:792,units:'pt',origin:'top-left',orientation:'portrait'},w=918,h=1188,scale=1.5;
for(const name of ['clean','gap-distractor','partial','missing-row','five-choice','mixed-nr','empty-ring-distractor']){
 const pixels=new Uint8ClampedArray(w*h*4).fill(255),truth=[];
 function ring(x,y,r,fill=false,broken=false){for(let j=Math.floor((y-r-1)*scale);j<=Math.ceil((y+r+1)*scale);j++)for(let i=Math.floor((x-r-1)*scale);i<=Math.ceil((x+r+1)*scale);i++){let dx=i/scale-x,dy=j/scale-y,d=Math.hypot(dx,dy);if((fill?d<=r:Math.abs(d-r)<=.65)&&(!broken||Math.atan2(dy,dx)>-1.2)){const k=(j*w+i)*4;pixels[k]=pixels[k+1]=pixels[k+2]=35;}}}
 const cols=name==='five-choice'?5:4;
 for(let g=0;g<2;g++){let ys=g===0?[90,111,153,174,195,216,237,258,279]:[90,111,132,174,195];for(let row=0;row<ys.length;row++){let y=ys[row],cs=[];for(let j=0;j<cols;j++){let x=80+g*148+j*18;cs.push({x,y});if(!(name==='partial'&&g===0&&row===4&&j===2)&&!(name==='missing-row'&&g===0&&row===4))ring(x,y,3.5,false,name==='partial'&&g===1&&row===2&&j===1);}truth.push(cs);}if(['gap-distractor','empty-ring-distractor'].includes(name)){let y=g===0?132:153;for(let j=0;j<cols;j++)ring(80+g*148+j*18,y,3.5,name==='gap-distractor');}}
 if(name==='mixed-nr'){for(let k=0;k<2;k++){let x=395+k*98;for(let row=0;row<10;row++)for(let j=0;j<4;j++){ring(x+j*13,155+row*11,3.7);ring(x+j*13,155+row*11,1,true);}for(let j=1;j<=2;j++)ring(x+j*13,144,3.7);}}
 const res=discoverBlankLayout({pixels,width:w,height:h},page,[{x:0,y:0},{x:w-1,y:0},{x:w-1,y:h-1},{x:0,y:h-1}],{});let rows=res.components.filter(c=>c.kind==='mc').flatMap(c=>c.items.map(i=>i.choices)),exact=0,matched=new Set();for(const t of truth){let k=rows.findIndex((r,i)=>!matched.has(i)&&r.length===t.length&&t.every((p,j)=>Math.hypot(p.x-r[j].x,p.y-r[j].y)<2));if(k>=0){exact++;matched.add(k);}}
 let hash=2166136261;for(let i=0;i<pixels.length;i+=4)hash=Math.imul(hash^pixels[i],16777619);console.log(JSON.stringify({name,hash:(hash>>>0).toString(16),rows:rows.length,exact,wrong:rows.length-exact,nr:res.components.filter(c=>c.kind==='nr').length,issues:res.issues}));
}
