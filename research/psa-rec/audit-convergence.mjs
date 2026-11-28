
import {decideGroup,decideNumerical} from './recognition-convergence.js';
export function audit(){
 const b=(s,c)=>({symbol:s,completion:c,probabilities:c==='complete'?[.01,.01,.98]:[.98,.01,.01],conditioned:true,rawCoreInk:.4});
 const e={id:'g',kind:'mc',status:'single',symbol:'A',review:false,choices:[{symbol:'A',score:.8,quality:{usable:true}},{symbol:'B',score:.02,quality:{usable:true}}]};
 const c={id:'g',kind:'mc',optical:'single',symbol:'A',evidenceComplete:true,bubbles:[b('A','complete'),b('B','no-added-mark')]};
 const valid={groupId:'g',kind:'mc',registration:'registered',geometry:'supported-original',reference:'verified',choices:['A','B'],est:e,cpas:c};
 const checks=[];
 const test=(name,input,expected)=>{const d=decideGroup(input);checks.push({name,pass:d.status===expected,actual:d.status,reason:d.reason??null})};
 test('valid-agreement',valid,'would-accept');
 for(const registration of ['rejected',null,undefined,'read'])test('registration-'+registration,{...valid,registration},'review');
 for(const geometry of ['unreliable','unobservable',null,undefined,'no-supported-change'])test('geometry-'+geometry,{...valid,geometry},'review');
 for(const reference of ['missing','stale','unverified',null,undefined])test('reference-'+reference,{...valid,reference},'review');
 test('missing-est',{...valid,est:null},'review');test('missing-cpas',{...valid,cpas:null},'review');
 test('duplicate-profile',{...valid,choices:['A','A']},'review');
 test('duplicate-evidence',{...valid,cpas:{...c,bubbles:[b('A','complete'),b('A','no-added-mark')]}},'review');
 test('mismatched-symbol',{...valid,cpas:{...c,symbol:'C'}},'review');
 test('inconsistent-optical',{...valid,cpas:{...c,bubbles:[b('A','no-added-mark'),b('B','complete')]}},'review');
 test('explicit-multiple',{...valid,est:{...e,status:'multiple'}},'review');
 test('partial',{...valid,cpas:{...c,bubbles:[b('A','complete'),b('B','incomplete')]}},'review');
 test('conflict',{...valid,est:{...e,symbol:'B'}},'review');
 test('bad-probability',{...valid,cpas:{...c,bubbles:[{...b('A','complete'),probabilities:[NaN,0,1]},b('B','no-added-mark')]}},'review');
 test('bad-score',{...valid,est:{...e,choices:[{...e.choices[0],score:Infinity},e.choices[1]]}},'review');
 test('missing-reference-patch',{...valid,cpas:{...c,bubbles:[{...b('A','complete'),conditioned:false},b('B','no-added-mark')]}},'review');
 test('malformed-stack',{...valid,policy:'stack',model:{},threshold:.78},'review');
 const nr={...valid,kind:'nr',choices:['1','2'],est:{...e,kind:'nr',symbol:'1',choices:e.choices.map((x,i)=>({...x,symbol:String(i+1)}))},cpas:{...c,kind:'nr',symbol:'1',bubbles:[b('1','complete'),b('2','no-added-mark')]}};
 test('nr-literal',{...nr,policy:'cpas-literal'},'would-accept');
 test('hwr-agreement',{...nr,hwr:{confident:true,symbol:'1',confidence:.9}},'would-accept');
 test('hwr-conflict',{...nr,hwr:{confident:true,symbol:'2',confidence:.9}},'review');
 test('hwr-unavailable',{...nr,hwr:null},'would-accept');
 test('hwr-cannot-rescue',{...nr,hwr:{confident:true,symbol:'1',confidence:.9},cpas:{...nr.cpas,optical:'uncertain'}},'review');
 test('hwr-invalid',{...nr,hwr:{confident:true,symbol:'9',confidence:.9}},'review');
 test('unverified-hwr-not-vote',{...nr,hwr:{confident:false,symbol:'2',confidence:.2}},'would-accept');
 const ids=['S0','S1','S2','S3'];const slots=t=>[...t].map((s,i)=>({groupId:ids[i],status:'would-accept',symbol:s===' '?null:s}));
 for(const [t,expected] of [['1.25','would-accept'],['    ','would-accept'],['03  ','review'],['1 2 ','review'],['1.  ','review'],['.25 ','review']])checks.push({name:'nr-format-'+t,pass:decideNumerical(slots(t),ids).status===expected});
 checks.push({name:'nr-unresolved',pass:decideNumerical([{status:'review'},...slots('123')],ids).status==='review'});
 test('null-input',null,'review');test('null-entry',{...valid,cpas:{...c,bubbles:[null,b('B','no-added-mark')]}},'review');test('sparse-entry',{...valid,est:{...e,choices:new Array(2)}},'review');test('wrong-group',{...valid,groupId:'wrong'},'review');test('stale-group',{...valid,cpas:{...c,id:'other'}},'review');test('bad-review-flag',{...valid,est:{...e,review:0}},'review');test('bad-evidence-flag',{...valid,cpas:{...c,evidenceComplete:1}},'review');test('invalid-literal',{...valid,est:{...e,status:'blank',symbol:'A'}},'review');test('invalid-hwr',{...nr,hwr:{}},'review');test('unreadable-cannot-rescue',{...nr,policy:'cpas-literal',est:{...nr.est,status:'unreadable'}},'review');checks.push({name:'nr-order',pass:decideNumerical(slots('1.25').reverse(),ids).status==='review'},{name:'nr-duplicate',pass:decideNumerical([slots('1.25')[0],...slots('1.25').slice(0,3)],ids).status==='review'},{name:'nr-missing-expected-ids',pass:decideNumerical(slots('1.25')).status==='review'});return checks;
}
