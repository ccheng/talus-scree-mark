// Research-only REG-R14: diagnostic priority, never a compatibility or grading gate.
// Frozen exploratory parameters from exact open data; independent reserve required.
export const peerLimit = .1;
export const gapThreshold = .034981412527906534;
export function rankPrintDifferences(sites) {
  const groups = new Map();
  const eligible = s => ['agreement','mismatch'].includes(s.status) && Number.isFinite(s.distance) && s.distance >= 0 && s.distance <= 2;
  for (const s of sites) {
    const key = JSON.stringify([s.block,s.kind]);
    if (!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(s);
  }
  return sites.map(s => {
    const group=groups.get(JSON.stringify([s.block,s.kind]));
    const unavailable=reason=>({block:s.block,kind:s.kind,symbol:s.symbol,status:'unavailable',reason,diagnosticOnly:true});
    if (!eligible(s)) return unavailable('site-not-observable');
    if (new Set(group.map(p=>p.symbol)).size!==group.length) return unavailable('duplicate-site');
    const peers=group.filter(p=>p!==s&&eligible(p)).map(p=>p.distance).sort((a,b)=>a-b);
    if(peers.length<3)return unavailable('insufficient-peers');
    const k=Math.floor(peers.length/2),median=peers.length%2?peers[k]:(peers[k-1]+peers[k])/2;
    const gap=s.distance-median;
    if(median>peerLimit)return { ...unavailable('group-disagreement'),median,gap,peerCount:peers.length };
    return {block:s.block,kind:s.kind,symbol:s.symbol,status:gap>gapThreshold?'inspect-local-difference':'no-relative-outlier',median,gap,peerCount:peers.length,diagnosticOnly:true};
  });
}
