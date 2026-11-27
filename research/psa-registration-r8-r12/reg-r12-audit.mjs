// Audit saved research records; run from repo root with Node.
import {readFileSync} from 'node:fs';
function audit(d){
 const tests=[];const check=(name,pass)=>tests.push({name,pass:!!pass});const sum=(rows,k)=>rows.reduce((a,r)=>a+r[k],0);
 const a=d["reg-r8-r9"],b=d["reg-r8b-bank"],c=d["reg-r9b-damage"],s=d["reg-r10"],t=d["reg-r10b-recovery"],u=d["reg-r10c-context"],e=d["reg-r11-enrollment"],p=d["reg-r11-pose"],q=d["reg-r11b-pose"];
 for(const [name,x] of [["R8/R9",a],["R8B",b],["R9B",c]]){check(name+" case count",x.rows.length===540&&x.total===540);check(name+" calibration split",x.rows.filter(r=>r.f<3).length===270&&x.rows.filter(r=>r.f>=3).length===270);}
 check("R8 fixed-window baseline",a.summary.change.baseline===69&&a.summary.same.baseline===0);
 check("R8B bank alphabet restriction",b.bankLabels.length===15&&!b.bankLabels.includes("K")&&b.templates===540);
 check("R8B unchanged identity flags",b.groups.same.identityMismatch===19&&b.groups.same.total===54);
 check("R9B equal-pixel controls",c.equivalence.length===9&&c.equivalence.every(r=>r.equalPixels&&r.sameComparator));
 check("R10 counts",s.length===24&&sum(s,"expected")===21&&sum(s,"old")===13&&sum(s,"next")===19);
 check("R10B counts",t.length===44&&sum(t,"expected")===44&&sum(t,"old")===27&&sum(t,"next")===35&&sum(t,"after")===36);
 check("R10B measured ring coverage",sum(t,"totalRings")===164&&sum(t,"visible")===153&&sum(t,"visibleAfter")===155&&sum(t,"localFalse")===0);
 check("R10C context does not certify identity",u.records.length===24&&u.summary.trueContext===3&&u.summary.falseContext===6&&u.records.every(r=>r.observations.every(o=>o.semanticAssurance===false)));
 check("R11 enrollment counts",e.records.length===24&&e.sum.expected===144&&e.sum.baseline.correct===96&&e.sum.segmented.correct===60);
 check("R11 conservative enrollment",e.sum.baseline.unverified===16&&e.sum.segmented.unverified===0);
 check("R11 pose first pilot",p.length===8&&p.filter(r=>r.valid&&r.auto.status==="read").length===5);
 check("R11B valid auto coverage",q.length===11&&q.filter(r=>r.valid&&r.auto.status==="read").length===5&&q.filter(r=>r.valid).length===6);
 check("R11B all structural/hard-veto negatives withheld",q.filter(r=>!r.valid).length===5&&q.filter(r=>!r.valid).every(r=>r.auto.status==="retake"&&r.auto.items===0&&r.manual.status==="retake"&&r.manual.items===0));
 check("R11B no ambiguous proposal promoted",q.filter(r=>r.diagnostic.attempted).length===4&&q.filter(r=>r.diagnostic.attempted).every(r=>!r.diagnostic.proposed));
 return {scope:"Audit of saved result records only; not a fresh execution of research harnesses, Node suite, independent fixture validation or product regression",checks:tests.length,passed:tests.filter(r=>r.pass).length,tests,totals:{glyphComparisons:a.total+b.total+c.total,idealizedEquivalencePairs:c.equivalence.length,structuralScenarios:s.length+t.length+u.records.length,enrollmentScenarios:e.records.length,poseScenarioRuns:p.length+q.length,distinctPoseCases:q.length}};
}
const names=["reg-r8-r9","reg-r8b-bank","reg-r9b-damage","reg-r10","reg-r10b-recovery","reg-r10c-context","reg-r11-enrollment","reg-r11-pose","reg-r11b-pose"];
const data=Object.fromEntries(names.map(n=>[n,JSON.parse(readFileSync(new URL(n+'-results.json',import.meta.url),'utf8'))]));
const result=audit(data);console.log(JSON.stringify(result,null,2));if(result.passed!==result.checks)process.exitCode=1;
