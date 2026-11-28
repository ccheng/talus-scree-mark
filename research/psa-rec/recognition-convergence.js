
import {stackDecision} from './stacking.js';
const review=(reason,extra={})=>({status:'review',symbol:null,reason,...extra});
const finite01=x=>Number.isFinite(x)&&x>=0&&x<=1;
const literal=(x,s)=>x==='blank'?s===null:x==='single'&&typeof s==='string'&&s.length>0;
const accept=(symbol,method)=>({status:'would-accept',symbol,method});
function decideInternal({groupId,kind,registration,geometry,reference,choices,est,cpas,hwr,model,threshold,policy='agreement'}={}){
 if(registration!=='registered')return review('registration-rejected');
 if(!['supported-original','supported-correction'].includes(geometry))return review('geometry-unverified');
 if(reference!=='verified')return review('reference-unverified');
 if(!['mc','nr'].includes(kind)||!Array.isArray(choices)||choices.length<2||choices.length>12||new Set(choices).size!==choices.length||choices.some(s=>typeof s!=='string'||!s))return review('invalid-choices');
 if(!est||!cpas||!Array.isArray(est.choices)||!Array.isArray(cpas.bubbles))return review('missing-evidence');
 if(typeof groupId!=='string'||!groupId||est.id!==groupId||cpas.id!==groupId)return review('group-identity-mismatch');
 if(typeof est.review!=='boolean'||typeof cpas.evidenceComplete!=='boolean')return review('invalid-evidence-state');
 if(!['single','blank','multiple','ambiguous','unreadable'].includes(est.status)||!['single','blank','uncertain','incomplete','competing'].includes(cpas.optical))return review('invalid-status');
 const sameSet=a=>a.length===choices.length&&new Set(Array.from(a,x=>x?.symbol)).size===choices.length&&Array.from(a).every(x=>x&&typeof x==='object'&&choices.includes(x.symbol));
 if(!sameSet(est.choices)||!sameSet(cpas.bubbles))return review('identity-mismatch');
 if(!est.choices.every(b=>b.quality?.usable===true&&finite01(b.score))||!cpas.evidenceComplete||!cpas.bubbles.every(b=>b.conditioned===true&&finite01(b.rawCoreInk)&&Array.isArray(b.probabilities)&&b.probabilities.length===3&&b.probabilities.every(finite01)&&Math.abs(b.probabilities.reduce((a,v)=>a+v,0)-1)<1e-4&&['no-added-mark','incomplete','complete'].includes(b.completion)))return review('unobservable');
 const E=literal(est.status,est.symbol)&&est.review===false,C=literal(cpas.optical,cpas.symbol);
 if((['single','blank'].includes(est.status)&&!literal(est.status,est.symbol))||(['single','blank'].includes(cpas.optical)&&!C))return review('invalid-literal');
 if(est.status==='unreadable')return review('unreadable');
 if((E&&est.symbol!==null&&!choices.includes(est.symbol))||(C&&cpas.symbol!==null&&!choices.includes(cpas.symbol)))return review('invalid-symbol');
 // A CPAS literal must agree with its own per-choice evidence.
 const marked=cpas.bubbles.filter(b=>b.completion==='complete'),partial=cpas.bubbles.some(b=>b.completion==='incomplete');
 if(C&&(partial||(cpas.optical==='blank'?marked.length!==0:marked.length!==1||marked[0].symbol!==cpas.symbol)))return review('inconsistent-optical');
 if(est.status==='multiple'||cpas.optical==='competing'||partial)return review('competing-or-incomplete');
 if(E&&C&&est.symbol!==cpas.symbol)return review('optical-conflict');
 if(hwr!=null&&(typeof hwr!=='object'||typeof hwr.confident!=='boolean'))return review('invalid-handwriting');
 if(hwr?.confident===true){
  if(kind!=='nr'||!finite01(hwr.confidence)||!choices.includes(hwr.symbol))return review('invalid-handwriting');
  if(!C||hwr.symbol!==cpas.symbol)return review('handwriting-disagreement');
 }
 if(policy==='agreement')return E&&C?accept(cpas.symbol,'optical-agreement'):review('agreement-unavailable');
 if(policy==='cpas-literal'&&kind==='nr')return C?accept(cpas.symbol,'cpas-literal-no-conflict'):review('optical-unresolved');
 if(policy==='stack'&&kind==='mc'){
  const d=stackDecision(est,cpas,model,threshold);
  return d.status==='would-accept'&&(d.symbol===null||choices.includes(d.symbol))?accept(d.symbol,'frozen-stacking'):review(d.reason??'stack-rejected');
 }
 return review('unsupported-policy');
}
export function decideGroup(input){try{const d=decideInternal(input);return {...d,groupId:input?.groupId??null}}catch{return review('invalid-evidence')}}
export function decideNumerical(slots,expectedIds){
 if(!Array.isArray(expectedIds)||expectedIds.length!==4||new Set(expectedIds).size!==4||Array.from(expectedIds).some(id=>typeof id!=='string'||!id)||!Array.isArray(slots)||slots.length!==4||Array.from(slots).some((s,i)=>s?.groupId!==expectedIds[i]||s.status!=='would-accept'||(s.symbol!==null&&(typeof s.symbol!=='string'||!/^([0-9]|\.)$/.test(s.symbol)))))return {status:'review',rawText:null,reason:'slot-review'};
 const rawText=slots.map(s=>s.symbol??' ').join('');
 if(rawText.trim()&&!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)? *$/.test(rawText))return {status:'review',rawText:null,reason:'nr-format'};
 return {status:'would-accept',rawText};
}
