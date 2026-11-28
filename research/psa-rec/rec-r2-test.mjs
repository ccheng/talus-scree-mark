export function testBoxes(proposeHandwritingBoxes) {
 const cases=[];
 for(const pitch of [13,22,32])for(const scale of [1.1,1.8,2.8])for(const kind of ['separate','shared','absent','horizontal-only','two-rows','one-missing','shifted-decoy']){
  const width=Math.ceil(220*scale+12),height=Math.ceil(240*scale+12),matrix=[scale,0,5,0,scale,5,0,0,1],values=new Uint8Array(width*height);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)values[y*width+x]=Math.round(242+8*(x/width-.5)+7*(y/height-.5));
  const centers=Array.from({length:4},(_,i)=>55+i*pitch),slots=centers.map((x,i)=>({id:'NR1.'+(i+1),choices:[...(i===1||i===2?[{symbol:'.',x,y:91,radius:3.4}]:[]),...Array.from({length:10},(_,j)=>({symbol:String(j),x,y:101+j*10,radius:3.4}))]}));
  const profile={page:{width:220,height:240},components:[{kind:'nr',id:'nr',items:[{id:'NR1',slots}]}]};
  const boxes=centers.map((x,i)=>({id:slots[i].id,x:x-pitch*(kind==='shared'?.5:.40),width:pitch*(kind==='shared'?1:.80),y:65,height:15}));
  const lines=[];
  function add(b,vertical=true){lines.push([b.x,b.y,b.x+b.width,b.y],[b.x,b.y+b.height,b.x+b.width,b.y+b.height]);if(vertical)lines.push([b.x,b.y,b.x,b.y+b.height],[b.x+b.width,b.y,b.x+b.width,b.y+b.height]);}
  if(kind!=='absent')for(const [i,b] of boxes.entries()){
    if(kind==='one-missing'&&i===2)continue;
    if(kind==='shifted-decoy')add({...b,x:b.x+pitch*.35});
    else if(kind==='two-rows'){add({...b,y:49,height:10});add({...b,y:66,height:14});}
    else add(b,kind!=='horizontal-only');
  }
  function segmentDistance(x,y,[a,b,c,d]){const t=Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)));return Math.hypot(x-a-t*(c-a),y-b-t*(d-b));}
  for(let y=Math.floor(43*scale);y<Math.ceil(86*scale+5);y++)for(let x=Math.floor(25*scale);x<width;x++){
    let opacity=0;for(const dy of [-.25,.25])for(const dx of [-.25,.25]){
      let px=(x+dx-5)/scale,py=(y+dy-5)/scale;
      if(lines.some(l=>segmentDistance(px,py,l)<.48))opacity+=.25;
    }values[y*width+x]=Math.round(values[y*width+x]*(1-opacity)+38*opacity);
  }
  const result=proposeHandwritingBoxes({width,height,values},profile,{status:'registered',pageToSource:matrix}).items[0];
  const expected=kind==='separate'||kind==='shared';
  const error=result.status==='proposed'?Math.max(...result.boxes.flatMap((b,i)=>[Math.abs(b.x-boxes[i].x),Math.abs(b.y-boxes[i].y),Math.abs(b.x+b.width-boxes[i].x-boxes[i].width),Math.abs(b.y+b.height-boxes[i].y-boxes[i].height)])):null;
  cases.push({pitch,scale,kind,expected,proposed:result.status==='proposed',error,reason:result.reason??null,correct:expected?result.status==='proposed'&&error<=1.25:result.status==='unavailable'});
 }
 return {cases,positive:cases.filter(c=>c.expected).length,correctPositive:cases.filter(c=>c.expected&&c.correct).length,negative:cases.filter(c=>!c.expected).length,correctNegative:cases.filter(c=>!c.expected&&c.correct).length,limits:'Synthetic rectified line drawings with known pose, not physical images or independently administered data. Proposals require teacher confirmation.'};
}