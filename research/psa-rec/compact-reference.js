// REC-R1 research adapter. Stores exact existing CPAS reference patch pixels, not a new recognition model.
import { samplePatch, backgroundStrip, completionFeatures } from '../../app/src/cpas-recognition/spatial.js';
const SIZE = 41 * 41;
const FORMAT = 'talus-cpas-reference-patches-v1';
const binding = profile => JSON.stringify([profile.id, profile.revision, profile.page, profile.components]);
function groups(profile) {
  return profile.components.flatMap(block => block.items.flatMap(item =>
    (item.kind === 'mc' ? [{ id: item.id, choices: item.choices }] : item.slots)
      .map(group => ({ block: block.id, nr: item.kind === 'nr', id: group.id, choices: group.choices }))));
}
function spec(group) {
  const [a,b] = group.choices;
  return { rotate: b ? Math.abs(b.y-a.y)>Math.abs(b.x-a.x) : group.nr,
    strip: backgroundStrip(b ? Math.hypot(b.x-a.x,b.y-a.y)/a.radius : 3) };
}
function key(group, bubble) { return JSON.stringify([group.id,bubble.symbol]); }
export function enrollReferencePatches(gray, profile, registration, { confirmedBlank = false } = {}) {
  if (!confirmedBlank || registration?.status !== 'registered') throw new Error('Teacher-confirmed blank and registered pose required');
  const all=groups(profile), count=all.reduce((n,g)=>n+g.choices.length,0);
  if (count<1 || count>1200) throw new Error('Unsupported bubble count');
  const pixels=new Uint8Array(count*SIZE), usable=new Uint8Array(count);
  const reasons={unobservable:0,suspectMcInk:0}; let offset=0;
  for(const g of all){
    const matrix=registration.refinedBlocks?.find(b=>b.id===g.block)?.matrix??registration.pageToSource;
    const {rotate,strip}=spec(g);
    for(const b of g.choices){
      const patch=samplePatch(gray,matrix,b,rotate);
      if(patch){
        const f=completionFeatures(patch,null,strip,g.nr);
        if(f && f[2]>=0){
          // An intentionally conservative MC blank-quality check. Not proof of blankness.
          if(!g.nr && f[2]>.105) reasons.suspectMcInk++;
          else { pixels.set(patch,offset*SIZE); usable[offset]=1; }
        } else reasons.unobservable++;
      } else reasons.unobservable++;
      offset++;
    }
  }
  return {format:FORMAT,binding:binding(profile),count,pixels,usable,reasons};
}
export function openReferencePatches(envelope,profile){
  const all=groups(profile), count=all.reduce((n,g)=>n+g.choices.length,0);
  if(!envelope||envelope.format!==FORMAT||envelope.binding!==binding(profile)||envelope.count!==count||
    count<1||count>1200||!(envelope.pixels instanceof Uint8Array)||envelope.pixels.length!==count*SIZE||
    !(envelope.usable instanceof Uint8Array)||envelope.usable.length!==count||
    envelope.usable.some(v=>v!==0&&v!==1))throw new Error('Invalid or stale reference patches');
  // Snapshot to avoid concurrent mutation. IndexedDB can preserve typed arrays without JSON/base64 expansion.
  const pixels=envelope.pixels.slice(),usable=envelope.usable.slice(),lookup=new Map();let offset=0;
  for(const g of all)for(const b of g.choices){const k=key(g,b);if(lookup.has(k))throw new Error('Duplicate bubble identity');lookup.set(k,offset++);}
  return { patchFor(groupId,symbol){
    const index=lookup.get(JSON.stringify([groupId,symbol]));
    return index===undefined||!usable[index]?null:pixels.slice(index*SIZE,(index+1)*SIZE);
  },usableCount:usable.reduce((a,b)=>a+b,0),count};
}
