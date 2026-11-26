import * as registration from '../../app/src/markerless-registration.js';
import * as authoring from '../../app/src/profile-authoring.js';
import * as images from '../../app/src/omr-image.js';
import * as evidence from './registration-evidence.mjs';
function testScope({registerMarkerless},{createMarkerlessProfile},{toGrayImage,grayAt},{scopeRowDisposition}){
 const page={width:612,height:792,units:'pt',origin:'top-left',orientation:'portrait'},scale=1.5,width=919,height=1189;
 const corners=[{x:0,y:0},{x:918,y:0},{x:918,y:1188},{x:0,y:1188}];
 const row=y=>Array.from({length:4},(_,i)=>({x:95+19*i,y,radius:4,symbol:'ABCD'[i]}));
 const known=[130,152,174].map(row),extra=row(196);
 const items=known.map((choices,i)=>({id:'Q'+(i+1),kind:'mc',choices,bounds:{x:87,y:choices[0].y-7,width:74,height:14}}));
 const block={id:'MC1',kind:'mc',bounds:{x:85,y:121,width:78,height:62},items};
 function raster(add){const pixels=new Uint8ClampedArray(width*height*4).fill(255);for(const a of [...known.flat(),...(add?extra:[])])for(let y=Math.floor((a.y-5)*scale);y<=(a.y+5)*scale;y++)for(let x=Math.floor((a.x-5)*scale);x<=(a.x+5)*scale;x++){if(Math.abs(Math.hypot(x/scale-a.x,y/scale-a.y)-4)>.7)continue;const k=4*(y*width+x);pixels[k]=pixels[k+1]=pixels[k+2]=20;}return {width,height,pixels,id:'scope-fixture'};}
 function count(image){const gray=toGrayImage(image);return extra.filter(a=>{let support=0;for(let k=0;k<24;k++){const t=k*Math.PI/12,c=Math.cos(t),s=Math.sin(t),ring=grayAt(gray,(a.x+4*c)*scale,(a.y+4*s)*scale),bg=grayAt(gray,(a.x+6*c)*scale,(a.y+6*s)*scale);if(bg-ring>75)support++;}return support>=18;}).length;}
 const cases=[{name:'complete-unexpected',scope:'complete',blank:false,expected:'review-extra-row'},{name:'partial-enrolled',scope:'partial',blank:true,expected:'enrolled-print-outside-scope'},{name:'partial-new',scope:'partial',blank:false,expected:'review-scope-uncertain'},{name:'explicit-exclusion',scope:'partial',blank:false,exclude:true,expected:'excluded'},{name:'incomplete-exclusion',scope:'partial',blank:false,partialExclude:true,expected:'review-scope-uncertain'}];
 return cases.map(s=>{const profile=createMarkerlessProfile({id:'scope',revision:1,name:'Scope fixture',page,components:[block],scope:'mc-only',mcCompleteness:s.scope,exclusions:s.exclude?[{x:86,y:188,width:75,height:17}]:s.partialExclude?[{x:86,y:188,width:20,height:17}]:[]});const blankSupports=count(raster(s.blank)),observed=count(raster(true)),disposition=scopeRowDisposition(profile,extra,blankSupports);const base=registerMarkerless(raster(true),profile,{corners,batch:{profileId:'scope',revision:1}});return {name:s.name,blankSupports,observed,disposition,expected:s.expected,pass:disposition===s.expected,baseline:base.status,baselineReasons:base.reasons};});
}
console.log(JSON.stringify(testScope(registration,authoring,images,evidence),null,2));
