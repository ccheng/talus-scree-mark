// Research-only ID allocation for new discovery items. Printed numbers are evidence,
// not display order. Existing kept response IDs are never overwritten.
export function planDiscoveryIds(kept, components, diagnostics) {
  const held = new Set(kept.flatMap(b => b.items.flatMap(i => [i.id, ...(i.slots ?? []).map(s=>s.id)])));
  const rows = components.flatMap(b=>b.items.map(i=>({b,i})));
  const requests = rows.map(({b,i})=>{
    const evidence=diagnostics.filter(d=>d.id===b.id&&d.row===i.id&&d.decision==='confirmed'&&Number.isSafeInteger(d.number)&&d.number>0);
    const claims=[...new Set(evidence.map(d=>d.number))];
    return {block:b.id,item:i.id,kind:i.kind,claims};
  });
  const count=new Map();
  for(const r of requests)if(r.kind==='mc')for(const n of r.claims)count.set(n,(count.get(n)??0)+1);
  const reserved=new Set([...held,...requests.filter(r=>r.kind==='mc').flatMap(r=>r.claims.map(n=>'MC'+n))]);
  const used=new Set(held),counters={mc:1,nr:1},assignments=[],issues=[];
  for(const r of requests){
    let id=null,reason=null;
    if(r.kind==='mc'&&r.claims.length===1&&count.get(r.claims[0])===1&&!held.has('MC'+r.claims[0]))id='MC'+r.claims[0];
    else {
      if(r.kind==='mc')reason=r.claims.length?'printed-number-conflict':'printed-number-unverified';
      do{id=r.kind.toUpperCase()+counters[r.kind]++}while(used.has(id)||reserved.has(id)||r.kind==='nr'&&[1,2,3,4].some(n=>used.has(id+'.'+n)));
    }
    used.add(id);
    if(r.kind==='nr')for(let j=1;j<=4;j++)used.add(id+'.'+j);
    const v={block:r.block,item:r.item,id,reason};
    assignments.push(v);if(reason)issues.push(v);
  }
  return {assignments,issues};
}
