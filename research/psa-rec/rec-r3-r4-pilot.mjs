// Deliberately bounded pilot, not independent validation or a classroom accuracy estimate.
export function compareRecognition({predict,evaluateCompletion,readBubbleRegions,measureNumericalBlankInk}) {
const cases=[],modes=['complete-dark','complete-light','complete-textured','blank','half','cross','ghost','double','complete-plus-ghost','complete-offset','scribble','complete-medium'];
const digits=['ab cdef'.replace(' ',''),'bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
const segs={a:[-.26,-.48,.26,-.48],b:[.26,-.48,.26,0],c:[.26,0,.26,.48],d:[-.26,.48,.26,.48],e:[-.26,0,-.26,.48],f:[-.26,-.48,-.26,0],g:[-.26,0,.26,0]};
const dist=(x,y,[a,b,c,d])=>{let t=Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)));return Math.hypot(x-a-t*(c-a),y-b-t*(d-b))};
const page={width:350,height:320};const mc=Array.from({length:12},(_,i)=>({kind:'mc',id:'MC'+(i+1),choices:Array.from({length:4},(_,j)=>({symbol:'ABCD'[j],x:42+j*22,y:28+i*23,radius:5}))}));
const nr=Array.from({length:3},(_,k)=>({id:'NR'+(k+1),kind:'nr',slots:Array.from({length:4},(_,j)=>({id:'NR'+(k+1)+'.'+(j+1),choices:[...(j===1||j===2?[{symbol:'.',x:175+j*16,y:26+k*99,radius:3.6}]:[]),...Array.from({length:10},(_,i)=>({symbol:String(i),x:175+j*16,y:35+i*8.3+k*99,radius:3.6}))]}))}));
const profile={id:'rec-pilot',revision:1,page,components:[{id:'MC',kind:'mc',items:mc},{id:'NR',kind:'nr',items:nr}]};
const groups=profile.components.flatMap(b=>b.items.flatMap(i=>i.kind==='mc'?[{id:i.id,choices:i.choices,nr:false}]:i.slots.map((s,j)=>({...s,nr:true,item:i.id,position:j}))));
const nrValues=['3.14','72  ','8.6 '];
function render(scale,shift,variation,blank=false){
  const width=Math.ceil(page.width*scale+20),height=Math.ceil(page.height*scale+20),values=new Uint8Array(width*height),matrix=[scale,0,shift,0,scale,shift,0,0,1];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)values[y*width+x]=Math.round(Math.max(0,Math.min(255,244+variation*15*(x/width-.5)+variation*8*Math.sin(y/height*3.5))));
  const truth={};
  for(const [k,g] of groups.entries()){
    const mode=g.nr? (g.item==='NR3'&&variation%2===1&&g.position===2?'half':(variation%3===1?'complete-light':'complete-dark')):modes[(k+Math.floor(variation))%modes.length];
    const symbol=g.nr?nrValues[Number(g.item.slice(2))-1][g.position]:'ABCD'[(k+variation)%4];
    const selected=symbol===' '?null:symbol,valid=mode.startsWith('complete')&&mode!=='complete-plus-ghost'||mode==='blank'||selected===null;
    truth[g.id]={mode,expected:mode==='blank'||!selected?null:selected,eligible:valid};
    for(const [j,b] of g.choices.entries()){
      const cx=b.x*scale+shift,cy=b.y*scale+shift,r=b.radius*scale;
      for(let yy=Math.max(0,Math.floor(cy-r-2));yy<Math.min(height,Math.ceil(cy+r+3));yy++)for(let xx=Math.max(0,Math.floor(cx-r-2));xx<Math.min(width,Math.ceil(cx+r+3));xx++){
        let u=(xx-cx)/r,v=(yy-cy)/r,d=Math.hypot(u,v),a=0;
        // Four subpixels provide antialiased ring/mark/printed-glyph evidence.
        for(const dx of [-.25,.25])for(const dy of [-.25,.25]){
          let x=u+dx/r,y=v+dy/r,rr=Math.hypot(x,y),ink=Math.abs(rr-1)<(.32+variation*.015)/b.radius?.92:0;
          if(g.nr){let glyph=b.symbol==='.'?Math.hypot(x,y-.35)<.11:digits[Number(b.symbol)].split('').some(s=>dist(x,y,segs[s])<.09);if(glyph)ink=Math.max(ink,.88)}
          if(!blank&&mode!=='blank'&&selected){
            const primary=b.symbol===selected,rival=b.symbol===g.choices[(g.choices.findIndex(c=>c.symbol===selected)+1)%g.choices.length].symbol;let mark=0;
            if(primary){
              if(mode==='complete-dark'&&rr<.87)mark=.85;
              if(mode==='complete-medium'&&rr<.85)mark=.45;
              if(mode==='complete-light'&&rr<.87)mark=.23;
              if(mode==='complete-textured'&&rr<.89)mark=.35+.25*(.5+.5*Math.sin(x*35+y*22));
              if(mode==='complete-offset'&&Math.hypot(x-.14,y+.08)<.85)mark=.65;
              if(mode==='half'&&rr<.85&&x<.1)mark=.9;
              if(mode==='cross'&&rr<.9&&(Math.abs(x-y)<.12||Math.abs(x+y)<.12))mark=.95;
              if(mode==='ghost'&&rr<.84)mark=.10+.06*(.5+.5*Math.sin(x*17+y*23));
              if(mode==='scribble'&&rr<.88&&Math.abs(y-.32*Math.sin(x*12))<.19)mark=.85;
              if((mode==='double'||mode==='complete-plus-ghost')&&rr<.87)mark=.85;
            }
            if(rival&&rr<.83){if(mode==='double')mark=.8;if(mode==='complete-plus-ghost')mark=.12;}
            ink=Math.max(ink,mark);
          }
          a+=ink/4;
        }
        values[yy*width+xx]=Math.round(values[yy*width+xx]*(1-a)+30*a);
      }
    }
  }
  return{gray:{width,height,values},status:'registered',pageToSource:matrix,truth};
}
const blank=render(2.8,9,0,true);profile.components=measureNumericalBlankInk(blank.gray,blank.pageToSource,profile.components);
const totals={};function record(kind,method,eligible,expected,value,accepted){const id=kind+'/'+method;const t=totals[id]??={eligible:0,policyReview:0,correct:0,wrong:0,violations:0,withheld:0};if(eligible)t.eligible++;else t.policyReview++;if(!accepted)t.withheld++;else if(!eligible)t.violations++;else if(value===expected)t.correct++;else t.wrong++;}
for(const [scale,shift,variant] of [[1.15,8,0],[1.5,9,1],[2,6,2],[2.5,8,3],[3,5,4],[1.8,7,5]]){
 const scan=render(scale,shift,variant),est=profile.components.flatMap(b=>readBubbleRegions(scan.gray,scan.pageToSource,b.items)),cp=evaluateCompletion(scan.gray,profile,scan,{reference:blank,predict,established:est});
 for(const e of est){
  const c=cp.items.find(i=>i.id===e.id);
  if(e.kind==='mc'){
    const tr=scan.truth[e.id],a=!e.review&&['single','blank'].includes(e.status),b=c.disposition==='would-accept',match=e.status===c.optical&&e.symbol===c.symbol;
    const policies={Established:[a,e.symbol],CPAS:[b,c.symbol],strictConsensus:[a&&b&&match,e.symbol],sameOptical:[a&&match&&c.evidenceComplete,e.symbol],cpasWithEstablishedRescue:[b&&(!a||match)||a&&match&&c.evidenceComplete,b?c.symbol:e.symbol]};
    for(const [name,[ok,val]] of Object.entries(policies))record('MC',name,tr.eligible,tr.expected,val,ok);
    cases.push({kind:'MC',scale,variant,id:e.id,...tr,established:{status:e.status,symbol:e.symbol,review:e.review},cpas:{optical:c.optical,symbol:c.symbol,disposition:c.disposition,confidence:c.confidence,evidenceComplete:c.evidenceComplete},policies:Object.fromEntries(Object.entries(policies).map(([k,[ok,val]])=>[k,ok?{accepted:true,value:val}:{accepted:false}]))});
  } else{
    const ts=e.slots.map(s=>scan.truth[s.id]),eligible=ts.every(t=>t.eligible),expected=ts.map(t=>t.expected??' ').join(''),a=!e.review&&e.rawText!==null, b=c.rawText!==null&&!c.reasons.length&&c.slots.every(s=>s.evidenceComplete);
    const match=e.rawText===c.rawText;
    const policies={Established:[a,e.rawText],CPASLiteral:[b,c.rawText],agreement:[a&&b&&match,e.rawText]};
    for(const [name,[ok,val]] of Object.entries(policies))record('NR',name,eligible,expected,val,ok);
    for(let j=0;j<4;j++){const t=ts[j],s=e.slots[j],z=c.slots[j];const a=!s.review&&['single','blank'].includes(s.status),b=['single','blank'].includes(z.optical)&&z.evidenceComplete;record('NRslot','Established',t.eligible,t.expected,s.symbol,a);record('NRslot','CPASLiteral',t.eligible,t.expected,z.symbol,b);record('NRslot','agreement',t.eligible,t.expected,s.symbol,a&&b&&s.symbol===z.symbol&&s.status===z.optical);}
    cases.push({kind:'NR',scale,variant,id:e.id,eligible,expected,established:{status:e.status,rawText:e.rawText,review:e.review},cpas:{rawText:c.rawText,reasons:c.reasons,slots:c.slots.map(s=>({optical:s.optical,symbol:s.symbol,confidence:s.confidence,evidenceComplete:s.evidenceComplete}))},policies:Object.fromEntries(Object.entries(policies).map(([k,[ok,val]])=>[k,ok?{accepted:true,value:val}:{accepted:false}]))});
  }
 }
}
return {totals,cases,limits:'Authored synthetic raster pilot, fixed oracle pose, seven-segment print approximation; no real paper, JPEG, CPAS/ISTE reserve, handwriting, registration uncertainty, or grading-policy validation. NR trailing blank treated as a literal space. Complete-plus-ghost treated as requiring review. Candidate rules not tuned or promoted.'};
}