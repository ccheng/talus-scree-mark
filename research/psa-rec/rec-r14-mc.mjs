// MC-only development experiment. Family split is fixed before rendering.
// Independent ISTE reserve is not used. No claim of physical classroom accuracy.
import {quantizeBlocks as _unused} from './photo-proxy.js';
export function runMC({predict,evaluateCompletion,readBubbleRegions,candidateFeatures,fitLogistic,score,stackDecision,model,decideGroup,quantizeBlocks,enrollVerifiedReference,openVerifiedReference,evaluateCached}){
 const modes=['dark','light','texture','offset','medium','blank','half','cross','ghost','double','plusghost','scribble','light','blank','patchy','edge'];
 const eligibleModes=new Set(['dark','light','texture','offset','medium','blank']);
 const groups={evaluation:[21,22,23,24,25,26]};
 function family(f){
  const radius=3.2+(f%5)*.47,pitch=14.5+(f%4)*2.7,dy=16+(f%3)*2.2,choiceCount=3+f%3;
  const items=Array.from({length:16},(_,i)=>({id:'MC'+(i+1),kind:'mc',choices:Array.from({length:choiceCount+(i%7===0&&choiceCount<5?1:0)},(_,j)=>({symbol:'ABCDE'[j],x:28+(i>=8?130:0)+j*pitch,y:28+(i%8)*dy,radius}))}));
  const profile={id:'family-'+f,revision:1,page:{width:290,height:205},components:[{id:'MC',kind:'mc',items}]};
  function render(capture,blank=false){
   const scale=blank?2.65:1.35+((f*3+capture*5)%11)*.14,shift=8+(capture%3),width=Math.ceil(290*scale+20),height=Math.ceil(205*scale+20);
   const values=new Uint8Array(width*height),matrix=[scale,0,shift,0,scale,shift,0,0,1],truth={};
   const contrast=blank?205:165+((f*17+capture*11)%65);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++){const noise=blank?0:(((x*97+y*53+f*71+capture*13)%19)-9)*.34;values[y*width+x]=Math.max(0,Math.min(255,Math.round(241+((f%3)-1)*22*(x/width-.5)+(capture-1)*15*(y/height-.5)+4*Math.sin(y/height*4+f)+noise)));}
   for(const [i,item] of items.entries()){
    const mode=modes[(i+capture*5+f*3)%modes.length],chosen=(i*3+capture+f)%item.choices.length,symbol=mode==='blank'?null:item.choices[chosen].symbol;
    truth[item.id]={mode,eligible:eligibleModes.has(mode),expected:symbol};
    for(const [j,b] of item.choices.entries()){
     const cx=b.x*scale+shift,cy=b.y*scale+shift,r=b.radius*scale;
     for(let yy=Math.max(0,Math.floor(cy-r-2));yy<Math.min(height,Math.ceil(cy+r+3));yy++)for(let xx=Math.max(0,Math.floor(cx-r-2));xx<Math.min(width,Math.ceil(cx+r+3));xx++){
      let ink=0;
      for(const ox of [-.25,.25])for(const oy of [-.25,.25]){
       const u=(xx+ox-cx)/r,v=(yy+oy-cy)/r,angle=(f%7)*.43, x=u*Math.cos(angle)-v*Math.sin(angle),y=u*Math.sin(angle)+v*Math.cos(angle),rr=Math.hypot(x,y);
       let a=Math.abs(rr-1)<(.28+(f%4)*.065)/b.radius?.93:0;
       if(!blank&&mode!=='blank'){
        let m=0,primary=j===chosen,rival=j===(chosen+1)%item.choices.length;
        const coverage=.82+(f%4)*.025,light=.12+(f%6)*.028,ghost=.055+(f%5)*.026,texture=.5+.5*Math.sin((13+f%6)*x+(23+f%7)*y+capture);
        if(primary){
         if(mode==='dark'&&rr<coverage)m=.82;
         if(mode==='light'&&rr<coverage)m=light;
         if(mode==='medium'&&rr<coverage)m=.39+(f%3)*.05;
         if(mode==='texture'&&rr<coverage)m=.24+.36*texture;
         if(mode==='offset'&&Math.hypot(x-.17,y+.11)<.84)m=.55;
         if(mode==='half'&&rr<.86&&x<.1+(f%3)*.1)m=.78;
         if(mode==='cross'&&rr<.9&&(Math.abs(x-y)<.08+(f%4)*.026||Math.abs(x+y)<.09))m=.88;
         if(mode==='ghost'&&rr<.86)m=ghost*(.6+.65*texture);
         if(mode==='scribble'&&rr<.88&&Math.abs(y-.32*Math.sin(x*(7+f%6)))<.12+(f%3)*.035)m=.7;
         if(mode==='patchy'&&rr<.86&&(texture>.66||x>.65))m=.65;
         if(mode==='edge'&&rr<.9&&rr>.54)m=.7;
         if((mode==='double'||mode==='plusghost')&&rr<coverage)m=.76;
        }
        if(rival&&rr<.84){if(mode==='double')m=.67;if(mode==='plusghost')m=ghost;}
        a=Math.max(a,m);
       }ink+=a/4;
      }
      values[yy*width+xx]=Math.round(Math.max(0,values[yy*width+xx]-contrast*ink));
     }
    }
   }
   // Deliberately perturbed *sampling pose*, never passed as a ground-truth feature.
   if(!blank){const displacement=[0,.25,.65,.95][(f+capture)%4];matrix[2]+=displacement*scale;matrix[5]-=.6*displacement*scale;}
   const gray={width,height,values};return {gray:blank?gray:quantizeBlocks(gray,45+capture*12),status:'registered',pageToSource:matrix,truth};
  }
  const blank=render(0,true),records=[]; const identity={referenceId:'reference-'+f,referenceRevision:1};const envelope=enrollVerifiedReference(blank.gray,profile,blank,{...identity,confirmedBlank:true}); const cache=openVerifiedReference(envelope,profile,identity);
  for(let capture=0;capture<3;capture++){
   const scan=render(capture),est=readBubbleRegions(scan.gray,scan.pageToSource,items),cp=evaluateCompletion(scan.gray,profile,scan,{reference:blank,predict,established:est});
   const cached=evaluateCached(scan.gray,profile,scan,{reference:cache,predict,established:est});const parity=JSON.stringify(cp.items)===JSON.stringify(cached.items);for(const e of est){
    const c=cp.items.find(i=>i.id===e.id),t=scan.truth[e.id],E=!e.review&&['single','blank'].includes(e.status),C=c.disposition==='would-accept',same=E&&['single','blank'].includes(c.optical)&&e.symbol===c.symbol&&c.evidenceComplete;
    const cand=candidateFeatures(e,c);const args={groupId:e.id,kind:'mc',registration:'registered',geometry:'supported-original',reference:'verified',choices:e.choices.map(b=>b.symbol),est:e,cpas:c,model,threshold:.7862137339932567}; const ag=decideGroup(args),st=decideGroup({...args,policy:'stack'});
    records.push({family:f,capture,id:e.id,...t,parity,cacheUsable:cache.usableCount,cacheCount:cache.count,unifiedAgreement:{accept:ag.status==='would-accept',symbol:ag.symbol,reason:ag.reason},unifiedStack:{accept:st.status==='would-accept',symbol:st.symbol,reason:st.reason},established:{accept:E,symbol:e.symbol},cpas:{accept:C,symbol:c.symbol},agreement:{accept:E&&C&&e.symbol===c.symbol,symbol:e.symbol},sameOptical:{accept:same,symbol:e.symbol},candidates:cand.map(x=>({...x,y:Number(t.eligible&&x.symbol===t.expected)}))});
   }
  }
  return records;
 }
 return groups.evaluation.flatMap(family);
}
