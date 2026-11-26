// Isolated research worker; no network or persistence. The host owns cancellation.
import {loadSVM} from './svm.mjs';
import {discoverNative} from './verifier.mjs';
let model=null;
// Frozen synthetic model. A changed model requires a new experimental revision.
export const MODEL_SHA256='d70778fe1dbea80e1219ff559dd4a5171c884655e80ab44c1b7cbb56e41149c3';
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
self.onmessage=async({data:m})=>{
 const id=m?.id;
 try{
  if(m.type==='init'){
   model=null;
   if(!(m.bytes instanceof ArrayBuffer)||m.bytes.byteLength!==8336736||m.meta?.sha256!==MODEL_SHA256||hex(await crypto.subtle.digest('SHA-256',m.bytes))!==MODEL_SHA256)throw Error('Model integrity check failed');
   // Validate metadata against the frozen numerical training artifact as well as binary bytes.
   const meta=m.meta;
   if(meta.count!==3129||meta.dimension!==324||meta.gamma!==0.2624178494652779||JSON.stringify(meta.classes)!=='[0,1,2,3,4,5,6,7,8,9]'||JSON.stringify(meta.nSupport)!=='[303,324,263,380,274,302,331,217,366,369]')throw Error('Model metadata mismatch');
   model=loadSVM(meta,new Uint8Array(m.bytes));self.postMessage({id,type:'ready'});
  }else if(m.type==='discover'){
   if(!model)throw Error('Model not initialized');
   if(!(m.pixels instanceof ArrayBuffer))throw Error('Expected grayscale ArrayBuffer');
   const result=discoverNative(new Uint8Array(m.pixels),m.width,m.height,model);
   self.postMessage({id,type:'result',result});
  }else throw Error('Unknown message');
 }catch(e){self.postMessage({id,type:'error',message:e instanceof Error?e.message:String(e)});}
};
