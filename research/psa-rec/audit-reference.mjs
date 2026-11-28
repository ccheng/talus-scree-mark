
import {enrollVerifiedReference,openVerifiedReference} from './verified-reference.js';
export function auditReference(){
 const profile={id:'p',revision:1,page:{width:100,height:100},components:[{id:'B',kind:'mc',items:[{id:'Q',kind:'mc',choices:[{symbol:'A',x:30,y:40,radius:5},{symbol:'B',x:50,y:40,radius:5}]}]}]};
 const gray={width:100,height:100,values:new Uint8Array(10000).fill(240)};
 for(let y=0;y<100;y++)for(let x=0;x<100;x++)if([30,50].some(cx=>Math.abs(Math.hypot(x-cx,y-40)-5)<.8))gray.values[y*100+x]=20;
 const registration={status:'registered',pageToSource:[1,0,0,0,1,0,0,0,1]},identity={referenceId:'blank-1',referenceRevision:1},opts={...identity,confirmedBlank:true};
 const env=enrollVerifiedReference(gray,profile,registration,opts),ref=openVerifiedReference(env,profile,identity);
 const checks=[{name:'valid-reference',pass:ref.usableCount===2}];
 const bad=(name,fn)=>{let pass=false;try{fn()}catch{pass=true}checks.push({name,pass})};
 const p=env.payload.pixels.slice();p[17]^=1;
 bad('same-length-pixel-corruption',()=>openVerifiedReference({...env,payload:{...env.payload,pixels:p}},profile,identity));
 const u=env.payload.usable.slice();u[0]^=1;
 bad('availability-corruption',()=>openVerifiedReference({...env,payload:{...env.payload,usable:u}},profile,identity));
 bad('pose-corruption',()=>openVerifiedReference({...env,pose:'changed'},profile,identity));
 bad('wrong-blank-id',()=>openVerifiedReference(env,profile,{...identity,referenceId:'other'}));
 bad('stale-blank-revision',()=>openVerifiedReference(env,profile,{...identity,referenceRevision:2}));
 bad('stale-profile-revision',()=>openVerifiedReference(env,{...profile,revision:2},identity));
 bad('wrong-sampler',()=>openVerifiedReference({...env,sampler:'unknown'},profile,identity));
 bad('invalid-pose',()=>enrollVerifiedReference(gray,profile,{...registration,pageToSource:Array(9).fill(0)},opts));
 bad('registration-veto',()=>enrollVerifiedReference(gray,profile,{...registration,status:'rejected'},opts));
 bad('not-confirmed-blank',()=>enrollVerifiedReference(gray,profile,registration,{...identity,confirmedBlank:false}));
 const copy=ref.patchFor('Q','A');copy.fill(0);checks.push({name:'snapshot-isolation',pass:ref.patchFor('Q','A').some(x=>x>0)});
 return checks;
}
