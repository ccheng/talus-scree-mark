// REC-R7: candidate-specific binary stacking; research-only, never authoritative grading.
export const featureNames=['establishedCandidate','cpasCandidate','establishedAccept','cpasAccept','establishedTargetInk','establishedRivalInk','establishedMargin','minimumOutlineSupport','minimumContrast','minimumSourceRadius','cpasTargetComplete','cpasRivalBlank','cpasTargetIncomplete','cpasRivalComplete','cpasTargetAddedInk','cpasRivalAddedInk','cpasMinimumRawAvailable','cpasGroupConfidence','blankCandidate','cpasEvidenceComplete'];
const clamp=x=>Math.max(0,Math.min(1,x));
const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
export function candidateFeatures(e,c){
 if(!e||!c||e.kind!=='mc'||c.kind!=='mc'||e.id!==c.id||!Array.isArray(e.choices)||!Array.isArray(c.bubbles)||!c.evidenceComplete)return [];
 const E=!e.review&&['single','blank'].includes(e.status), C=['single','blank'].includes(c.optical);
 const es=E?e.symbol:undefined,cs=C?c.symbol:undefined;
 // Never resolve conflicting single/blank outputs or explicit multiple marks by learned override.
 if((E&&C&&es!==cs)||e.status==='multiple'||c.optical==='competing')return [];
 const symbols=[...new Set([...(E?[es]:[]),...(C?[cs]:[])])];
 return symbols.flatMap(symbol=>{
   const eq=e.choices.find(b=>b.symbol===symbol),cq=c.bubbles.find(b=>b.symbol===symbol);
   const rivalsE=e.choices.filter(b=>b.symbol!==symbol),rivalsC=c.bubbles.filter(b=>b.symbol!==symbol);
   if(symbol!==null&&(!eq||!cq)||e.choices.some(b=>!Number.isFinite(b.score)||!b.quality?.usable)||c.bubbles.some(b=>!Array.isArray(b.probabilities)||b.probabilities.length!==3||b.probabilities.some(p=>!Number.isFinite(p))))return [];
   const max=(a,f)=>Math.max(0,...a.map(f)),min=(a,f)=>Math.min(...a.map(f));
   const target=finite(eq?.score),rival=max(rivalsE,b=>b.score);
   const features=[Number(E&&es===symbol),Number(C&&cs===symbol),Number(E),Number(c.disposition==='would-accept'),
   target,rival,target-rival,min(e.choices,b=>finite(b.quality.outlineSupport)),min(e.choices,b=>finite(b.quality.contrast)/255),
   min(e.choices,b=>Math.min(1,finite(b.evidence?.sourceRadius)/20)),
   finite(cq?.probabilities[2]),min(rivalsC,b=>b.probabilities[0]),finite(cq?.probabilities[1]),max(rivalsC,b=>b.probabilities[2]),
   finite(cq?.addedInk),max(rivalsC,b=>finite(b.addedInk)),Number(c.bubbles.every(b=>b.rawCoreInk!==null)),finite(c.confidence),Number(symbol===null),Number(c.evidenceComplete)];
   return features.every(Number.isFinite)?[{symbol,features}]:[];
 });
}
const sigmoid=z=>z>=0?1/(1+Math.exp(-z)):Math.exp(z)/(1+Math.exp(z));
export function fitLogistic(rows,{lambda=.05,steps=1800}={}){
 if(!rows.length||new Set(rows.map(r=>r.y)).size!==2)throw Error('Need both labels');
 const d=featureNames.length,n=rows.length;
 const mean=Array.from({length:d},(_,j)=>rows.reduce((s,r)=>s+r.features[j],0)/n);
 const sd=mean.map((m,j)=>Math.max(.05,Math.sqrt(rows.reduce((s,r)=>s+(r.features[j]-m)**2,0)/n)));
 const X=rows.map(r=>r.features.map((v,j)=>(v-mean[j])/sd[j])),w=new Array(d).fill(0);let bias=0;
 for(let k=0;k<steps;k++){
  const grad=new Array(d).fill(0);let gb=0;
  for(let i=0;i<n;i++){let z=bias;for(let j=0;j<d;j++)z+=w[j]*X[i][j];let err=sigmoid(z)-rows[i].y;gb+=err;for(let j=0;j<d;j++)grad[j]+=err*X[i][j]}
  bias-=.12*gb/n;for(let j=0;j<d;j++)w[j]-=.12*(grad[j]/n+lambda*w[j]);
 }
 return {format:'rec-logistic-v1',featureNames:[...featureNames],mean,sd,w,bias,lambda};
}
export function score(model,features){
 if(model.format!=='rec-logistic-v1'||features.length!==featureNames.length||model.featureNames?.join('|')!==featureNames.join('|')||!features.every(Number.isFinite)||!Number.isFinite(model.bias)||[model.mean,model.sd,model.w].some(a=>!Array.isArray(a)||a.length!==featureNames.length||!a.every(Number.isFinite))||model.sd.some(v=>v<=0))throw Error('Invalid stacking input');
 return sigmoid(model.bias+features.reduce((z,v,j)=>z+(v-model.mean[j])/model.sd[j]*model.w[j],0));
}
export function stackDecision(e,c,model,threshold){
 if(!Number.isFinite(threshold)||threshold<0||threshold>1)return {status:'review',reason:'invalid-threshold'};
 try{const candidates=candidateFeatures(e,c).map(x=>({...x,score:score(model,x.features)})).sort((a,b)=>b.score-a.score);
 if(candidates.length!==1||candidates[0].score<threshold)return {status:'review',reason:'insufficient-evidence'};
 return {status:'would-accept',symbol:candidates[0].symbol,score:candidates[0].score};
 }catch{return {status:'review',reason:'invalid-evidence'}}
}
