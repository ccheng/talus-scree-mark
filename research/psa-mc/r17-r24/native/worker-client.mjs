// One bounded job per worker. The caller owns assets and termination; no remote fetches here.
export class MCWorker{
 constructor(factory=()=>new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'})){this.worker=factory();this.next=0;this.pending=null;this.closed=false;this.worker.onmessage=({data:m})=>{if(!this.pending||m.id!==this.pending.id)return;const p=this.pending;this.pending=null;clearTimeout(p.timer);m.type==='error'?p.reject(new Error(m.message)):p.resolve(m.result??m.type);};this.worker.onerror=e=>{this.close(e.message??'Worker failure');};}
 request(type,data,transfer=[],timeout=20000){if(this.closed||this.pending)return Promise.reject(Error('Worker unavailable or busy'));return new Promise((resolve,reject)=>{const id=++this.next;const timer=setTimeout(()=>this.close('Worker timeout'),timeout);this.pending={id,resolve,reject,timer};try{this.worker.postMessage({id,type,...data},transfer);}catch(e){this.close(e.message);}});}
 init(meta,bytes){return this.request('init',{meta,bytes},[bytes]);}
 discover(pixels,width,height,nr=[],timeout=20000){return this.request('discover',{pixels,width,height,nr},[pixels],timeout);}
 close(reason='Worker canceled'){if(this.closed)return;this.closed=true;this.worker.terminate();if(this.pending){clearTimeout(this.pending.timer);this.pending.reject(Error(reason));this.pending=null;}}
}
