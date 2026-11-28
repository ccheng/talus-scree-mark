import { pagePsaProposals,reconcilePsaPage,mapPsaGrid } from './nr-admission-candidate.js';
import { planDiscoveryIds } from './numbering-candidate.js';
export function audit(){
 const checks=[];const ck=(name,condition)=>{checks.push({name,pass:!!condition});if(!condition)throw Error(name)};
 const page={width:612,height:792},scale=2.4,center=(x,y)=>[x*scale,y*scale];
 const grid=(x,extra={})=>({path:'header',decision:'accept',completeOutlines:false,centers:Array.from({length:40},(_,i)=>center(x+17*(i%4),180+12*Math.floor(i/4))),decimals:[center(x+17,168),center(x+34,168)],rasterShape:[4*scale,4*scale],evidence:{status:'mapped',support:40,svm_margin:2,svm_wins:8},...extra});
 const layout=(components=[])=>({components,diagnostics:[],issues:components.length?[]:['no-grid']});
 const run=(p,components=[],exclusions=[])=>reconcilePsaPage(layout(components),pagePsaProposals({proposals:p},page),exclusions);
 const a=run([grid(310),grid(380),grid(450),grid(520)]);
 ck('four provisional grids',a.psa.added===4&&a.psa.reviewCount===4&&a.components.length===4);
 ck('all 168 inferred choices',a.components.flatMap(b=>b.items[0].slots.flatMap(s=>s.choices)).filter(c=>c.provenance==='inferred').length===168);
 ck('explicit review issue',a.status==='review'&&a.issues.includes('psa-provisional-grids')&&a.diagnostics.every(d=>d.psaReview===true));
 ck('verified complete stays accepted',run([grid(310,{completeOutlines:true})]).psa.reviewCount===0);
 for(const [name,extra] of [['negative-margin',{evidence:{status:'mapped',support:40,svm_margin:-1,svm_wins:8}}],['insufficient-support',{evidence:{status:'mapped',support:39,svm_margin:2,svm_wins:8}}],['wrong-path',{path:'decimal'}],['missing-evidence',{evidence:{}}]]){
  const r=run([grid(310,extra)]);ck(name,r.psa.added===0&&r.conflictRegions.length===1&&r.status==='review');
 }
 const r=run([grid(310,{decision:'reject'})]);ck('explicit rejection not promoted',r.psa.added===0);
 const one=pagePsaProposals({proposals:[grid(310)]},page)[0].block;
 ck('exclusion respected',run([grid(310)],[],[one.bounds]).psa.added===0);
 const overlap={...one,id:'mc',kind:'mc'};
 ck('overlapping MC not overwritten',run([grid(310)],[overlap]).components[0]===overlap&&run([grid(310)],[overlap]).conflictRegions.length===1);
 ck('competing NR withheld',run([grid(310),grid(311)]).psa.added===0);
 ck('bounded path remains strict',mapPsaGrid({proposals:[grid(310)]},{x:0,y:0,width:612,height:792})===null);
 const blocks=[1,10,2,11,12,3,4,13,5,14,6,7,8,9].map((n,j)=>({id:'b'+j,items:[{id:'p'+j,kind:'mc'}]}));
 const evidence=blocks.map((b,j)=>({id:b.id,row:b.items[0].id,decision:'confirmed',number:[1,10,2,11,12,3,4,13,5,14,6,7,8,9][j]}));
 const plan=planDiscoveryIds([],blocks,evidence);
 ck('printed order preserved',plan.assignments.every((v,j)=>v.id==='MC'+evidence[j].number)&&plan.issues.length===0);
 ck('no mutation',blocks[0].items[0].id==='p0');
 const dup=planDiscoveryIds([],blocks,[...evidence.slice(0,1),{...evidence[1],number:1},...evidence.slice(2)]);
 ck('duplicate printed claim flagged',dup.issues.length===2&&new Set(dup.assignments.map(v=>v.id)).size===14&&dup.assignments.every(v=>v.id!=='MC1'));
 const collision=planDiscoveryIds([{items:[{id:'MC1'}]}],blocks,evidence);
 ck('kept collision flagged',collision.issues.length===1&&collision.assignments.every(v=>v.id!=='MC1'));
 const unknown=planDiscoveryIds([],blocks,evidence.slice(1));
 ck('unverified numbering flagged without stealing confirmed',unknown.issues.length===1&&unknown.assignments[1].id==='MC10');
 const ambiguous=planDiscoveryIds([],blocks,[...evidence,{...evidence[0],number:99}]);
 ck('conflicting row evidence flagged',ambiguous.issues.length===1&&ambiguous.assignments[0].id!=='MC1'&&ambiguous.assignments[0].id!=='MC99');
 return checks;
}
