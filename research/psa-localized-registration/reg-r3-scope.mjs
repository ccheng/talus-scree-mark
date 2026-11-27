// REG-R3 coordinate-level policy prototype; not a product gate.
function classifyScope(profile, observations, options={}) {
  // Research-only contract: caller must provide independently observed, uniquely
  // localized rows, not hypothetical positions or duplicated detector proposals.
  // Never returns a scan authorization or overrides any Established veto.
  const tol=options.tolerance??1.5;
  const veto=options.hardVeto??null;
  if(veto)return {status:"withhold",reason:veto};
  const finite=x=>typeof x==="number"&&Number.isFinite(x);
  const validChoice=c=>c&&finite(c.x)&&finite(c.y)&&finite(c.radius)&&c.radius>0;
  const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
  const validRow=r=>r&&typeof r.id==="string"&&Array.isArray(r.choices)&&r.choices.length>=2&&r.choices.every(validChoice)&&r.choices.every((c,i)=>r.choices.slice(0,i).every(p=>distance(c,p)>c.radius+p.radius));
  const unique=rows=>new Set(rows.map(r=>r.id)).size===rows.length;
  const inRect=(c,r,margin=0)=>c.x-c.radius-margin>=r.x&&c.y-c.radius-margin>=r.y&&c.x+c.radius+margin<=r.x+r.width&&c.y+c.radius+margin<=r.y+r.height;
  const overlaps=(a,b,guard=0)=>distance(a,b)<=a.radius+b.radius+guard;
  if(!profile||!Array.isArray(profile.required)||!Array.isArray(profile.known)||!Array.isArray(profile.exclusions)||!Array.isArray(observations)||!finite(tol)||tol<=0||tol>2||
      ![...profile.required,...profile.known,...observations].every(validRow)||!unique([...profile.required,...profile.known])||!unique(observations))
    return {status:"withhold",reason:"invalid-evidence"};
  if(profile.binding!==options.binding||typeof profile.binding!=="string"||!profile.binding.length)
    return {status:"withhold",reason:"stale-or-missing-enrollment"};
  if(!profile.required.length||!profile.exclusions.every(r=>r&&[r.x,r.y,r.width,r.height].every(finite)&&r.width>0&&r.height>0))
    return {status:"withhold",reason:"invalid-enrollment"};
  const requiredChoices=profile.required.flatMap(r=>r.choices);
  const knownChoices=profile.known.flatMap(r=>r.choices);
  // Required structure cannot be masked by scope declarations or by a known row.
  if(profile.exclusions.some(r=>requiredChoices.some(c=>c.x+c.radius+tol>=r.x&&c.x-c.radius-tol<=r.x+r.width&&c.y+c.radius+tol>=r.y&&c.y-c.radius-tol<=r.y+r.height))||
     knownChoices.some(c=>requiredChoices.some(p=>overlaps(c,p,tol))))
    return {status:"withhold",reason:"exclusion-overlaps-required"};
  // Multiple observations cannot claim the same physical outline.
  for(let i=0;i<observations.length;i++)for(let j=0;j<i;j++)if(observations[i].choices.some(c=>observations[j].choices.some(p=>distance(c,p)<=tol)))
    return {status:"withhold",reason:"duplicate-observation"};
  // A row's footprint must match every enrolled choice uniquely. No renumbering,
  // per-row warp, partial matches or label assumptions. Geometry is not semantics.
  function match(a,b){
    if(a.choices.length!==b.choices.length)return false;
    const pairs=a.choices.map(c=>b.choices.map((p,i)=>({p,i})).filter(({p})=>distance(c,p)<=tol&&Math.abs(c.radius-p.radius)<=.25*c.radius));
    return pairs.every(p=>p.length===1)&&new Set(pairs.map(p=>p[0].i)).size===b.choices.length;
  }
  const used=new Set(),requiredMatched=[];
  for(const row of profile.required){
    const candidates=observations.map((r,i)=>({r,i})).filter(({r,i})=>!used.has(i)&&match(row,r));
    if(candidates.length!==1)return {status:"withhold",reason:candidates.length?"ambiguous-required-row":"required-row-unverified",row:row.id};
    used.add(candidates[0].i);requiredMatched.push(row.id);
  }
  const ignored=[],unknown=[];
  const partial=profile.scope==="mc-only"&&profile.completeness==="partial";
  for(let i=0;i<observations.length;i++){
    if(used.has(i))continue;
    const row=observations[i];
    if(row.choices.some(c=>requiredChoices.some(p=>overlaps(c,p,tol))))
      return {status:"withhold",reason:"extra-overlaps-required",row:row.id};
    const matches=profile.known.filter(k=>k.confirmed===true&&match(k,row)&&!ignored.some(x=>x.enrolled===k.id));
    // Conservative policy for the first pilot: a complete profile never exempts
    // a newly observed row merely on scope or an exclusion rectangle.
    if(partial&&matches.length===1&&profile.exclusions.some(rect=>matches[0].choices.every(c=>inRect(c,rect,tol))&&row.choices.every(c=>inRect(c,rect,tol)))){
      ignored.push({observed:row.id,enrolled:matches[0].id});
    }else unknown.push(row.id);
  }
  if(unknown.length)return {status:partial?"review":"withhold",reason:"unexpected-structure",requiredMatched,ignored,unknown};
  return {status:"geometry-consistent",reason:"all-observed-rows-accounted-for",requiredMatched,ignored,unknown,semanticAssurance:false};
}
function verify(){
  const row=(id,y,x=100,count=4,r=3)=>({id,choices:Array.from({length:count},(_,i)=>({x:x+18*i,y,radius:r}))});
  const a=row("MC1",100),b=row("MC2",120),c=row("MC3",140),k={...row("EX4",160),confirmed:true};
  const binding="profile-a/revision-1/geometry-a";
  const base={scope:"mc-only",completeness:"partial",binding,required:[a,b,c],known:[k],exclusions:[{x:90,y:151,width:80,height:18}]};
  const shift=(r,dx,dy,id=r.id)=>({...r,id,choices:r.choices.map(p=>({...p,x:p.x+dx,y:p.y+dy}))});
  const cases=[
    ["ordinary complete evidence",base,[a,b,c],{},"geometry-consistent"],
    ["confirmed known excluded row",base,[a,b,c,k],{},"geometry-consistent"],
    ["known row with bounded noise",base,[a,b,c,shift(k,.7,-.8)],{},"geometry-consistent"],
    ["known row moved",base,[a,b,c,shift(k,0,4)],{},"review"],
    ["unknown row outside exclusions",base,[a,b,c,row("NEW",180)],{},"review"],
    ["unknown row inside exclusion",{...base,known:[]},[a,b,c,k],{},"review"],
    ["unknown row even with known exclusion evidence",base,[a,b,c,row("NEW",160,105)],{},"review"],
    ["known row not teacher-confirmed",{...base,known:[{...k,confirmed:false}]},[a,b,c,k],{},"review"],
    ["known row without explicit exclusion",{...base,exclusions:[]},[a,b,c,k],{},"review"],
    ["known row partially outside exclusion",{...base,exclusions:[{x:100,y:151,width:80,height:18}]},[a,b,c,k],{},"review"],
    ["complete profile with extra",{...base,completeness:"complete"},[a,b,c,k],{},"withhold"],
    ["complete profile with no extra",{...base,completeness:"complete"},[a,b,c],{},"geometry-consistent"],
    ["missing required row despite exclusion",base,[a,b,k],{},"withhold"],
    ["moved required row",base,[a,b,shift(c,0,4),k],{},"withhold"],
    ["extra choice in required row",base,[a,b,row("MC3",140,100,5),k],{},"withhold"],
    ["exclusion crosses required bubbles",{...base,exclusions:[{x:90,y:138,width:80,height:30}]},[a,b,c,k],{},"withhold"],
    ["known row overlaps required",{...base,known:[{...c,id:"EX3",confirmed:true}]},[a,b,c],{},"withhold"],
    ["duplicate detection",base,[a,b,c,k,shift(k,.5,.5,"DUP")],{},"withhold"],
    ["wrong enrollment revision",base,[a,b,c,k],{binding:"profile-a/revision-2/geometry-a"},"withhold"],
    ["mirror veto",base,[a,b,c,k],{hardVeto:"mirrored-registration"},"withhold"],
    ["multiple sheet veto",base,[a,b,c,k],{hardVeto:"multiple-sheets"},"withhold"],
    ["clipping veto",base,[a,b,c,k],{hardVeto:"clipped-content"},"withhold"],
    ["invalid radius",base,[a,b,{...c,choices:c.choices.map(p=>({...p,radius:0}))}],{},"withhold"],
    ["wrong layout at identical geometric locations",base,[a,b,c,k],{},"geometry-consistent"],
    ["partial flag alone never exempts",{...base,known:[],exclusions:[]},[a,b,c,k],{},"review"],
  ];
  const results=cases.map(([name,p,obs,o,expected])=>({name,expected,...classifyScope(p,obs,{binding,...o})}));
  // Deterministic bounded-jitter checks: no generator output may relax required geometry.
  let seed=17;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  const jitter=r=>({...r,choices:r.choices.map(p=>({...p,x:p.x+(rand()-.5)*1.4,y:p.y+(rand()-.5)*1.4}))});
  const stress={valid:0,unknownReview:0,requiredMissingWithheld:0,totalPerClass:100};
  for(let i=0;i<100;i++){
    const obs=[a,b,c,k].map(jitter);
    if(classifyScope(base,obs,{binding}).status==="geometry-consistent")stress.valid++;
    if(classifyScope(base,[...obs,jitter(row("NEW",180))],{binding}).status==="review")stress.unknownReview++;
    if(classifyScope(base,[obs[0],obs[1],obs[3]],{binding}).status==="withhold")stress.requiredMissingWithheld++;
  }
  return {tests:results.length,passed:results.filter(r=>r.status===r.expected).length,stress,results,limitation:"coordinate-level synthetic contract test; no actual image detector, semantic proof or scan authorization"};
}
export {classifyScope,verify};
const result=verify();
console.log(JSON.stringify(result,null,2));
if(result.passed!==result.tests||Object.entries(result.stress).some(([k,v])=>k!=='totalPerClass'&&v!==result.stress.totalPerClass))throw Error('REG-R3 test failed');
