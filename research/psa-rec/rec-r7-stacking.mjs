// MC-only development experiment. Family split is fixed before rendering.
// Independent ISTE reserve is not used. No claim of physical classroom accuracy.
export function runStacking({predict,evaluateCompletion,readBubbleRegions,candidateFeatures,fitLogistic,score,stackDecision}){
 const modes=['dark','light','texture','offset','medium','blank','half','cross','ghost','double','plusghost','scribble','light','blank','patchy','edge'];
 const eligibleModes=new Set(['dark','light','texture','offset','medium','blank']);
 const groups={train:[0,1,2,3,4,5,6,7,8],calibration:[9,10,11,12],evaluation:[13,14,15,16,17]};
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
   return {gray:{width,height,values},status:'registered',pageToSource:matrix,truth};
  }
  const blank=render(0,true),records=[];
  for(let capture=0;capture<3;capture++){
   const scan=render(capture),est=readBubbleRegions(scan.gray,scan.pageToSource,items),cp=evaluateCompletion(scan.gray,profile,scan,{reference:blank,predict,established:est});
   for(const e of est){
    const c=cp.items.find(i=>i.id===e.id),t=scan.truth[e.id],E=!e.review&&['single','blank'].includes(e.status),C=c.disposition==='would-accept',same=E&&['single','blank'].includes(c.optical)&&e.symbol===c.symbol&&c.evidenceComplete;
    const cand=candidateFeatures(e,c);
    records.push({family:f,capture,id:e.id,...t,established:{accept:E,symbol:e.symbol},cpas:{accept:C,symbol:c.symbol},agreement:{accept:E&&C&&e.symbol===c.symbol,symbol:e.symbol},sameOptical:{accept:same,symbol:e.symbol},candidates:cand.map(x=>({...x,y:Number(t.eligible&&x.symbol===t.expected)}))});
   }
  }
  return records;
 }
 const all=Object.fromEntries(Object.entries(groups).map(([name,ids])=>[name,ids.flatMap(family)]));
 const train=all.train.flatMap(r=>r.candidates);
 const model=fitLogistic(train);
 const addScores=records=>records.map(r=>({...r,candidates:r.candidates.map(c=>({...c,score:score(model,c.features)}))}));
 const cal=addScores(all.calibration),test=addScores(all.evaluation);
 // Fixed calibration policy: lowest threshold >= .50 with zero accepted incorrect/policy-invalid candidates.
 // Threshold is fitted on calibration only, not adjusted on evaluation.
 const negative=cal.flatMap(r=>r.candidates.filter(c=>!c.y).map(c=>c.score));
 const threshold=Math.min(1,Math.max(.5,negative.length?Math.max(...negative)+1e-8:.5));
 function summarize(rows,policy,t=threshold){
  const out={eligible:0,policyReview:0,correct:0,wrong:0,violations:0,withheld:0};
  for(const r of rows){
   if(r.eligible)out.eligible++;else out.policyReview++;
   const c=r.candidates[0],decision=policy==='stack'?{accept:r.candidates.length===1&&c.score>=t,symbol:c?.symbol}:r[policy];
   if(!decision.accept)out.withheld++;else if(!r.eligible)out.violations++;else if(decision.symbol===r.expected)out.correct++;else out.wrong++;
  }return out;
 }
 const policies=['established','cpas','agreement','sameOptical','stack'];
 const summaries=Object.fromEntries([['calibration',cal],['evaluation',test]].map(([k,rows])=>[k,Object.fromEntries(policies.map(p=>[p,summarize(rows,p)]))]));
 const curves=[.5,.6,.7,.8,.9,.95,.98,threshold,1].sort((a,b)=>a-b).map(t=>({threshold:t,calibration:summarize(cal,'stack',t),evaluation:summarize(test,'stack',t)}));
 const perFamily=groups.evaluation.map(f=>({family:f,...Object.fromEntries(policies.map(p=>[p,summarize(test.filter(r=>r.family===f),p)]))}));
 const trainCounts={items:all.train.length,rows:train.length,positive:train.filter(r=>r.y).length,negative:train.filter(r=>!r.y).length};
 const byMode=Object.fromEntries([...new Set(modes)].map(mode=>[mode,Object.fromEntries(policies.map(p=>[p,summarize(test.filter(r=>r.mode===mode),p)]))]));
 // End-to-end native decision parity on actual candidate evidence is checked by unit harness separately.
 return {groups,trainCounts,threshold,model,summaries,curves,perFamily,byMode,records:{train:all.train,calibration:cal,evaluation:test},limitations:'All families authored by same generator. Known affine pose with synthetic displacement; no real photos, handwriting, registration failure denominator, original ISTE reserve, or independent test. Strict marking policy is experimental. Model score is not a validated probability.'};
}