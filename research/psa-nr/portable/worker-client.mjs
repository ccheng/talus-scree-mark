// A single-flight, cancellable research wrapper. A cancelled/timed-out worker must be reinitialized.
export class NRWorker {
 constructor(){this.worker=null;this.pending=null;this.id=0;this.ready=false;}
 start(){this.close();const worker=new Worker(new URL('./worker.mjs',import.meta.url),{type:'module'});this.worker=worker;worker.onmessage=({data})=>{const p=this.pending;if(this.worker!==worker||!p||p.id!==data.id)return;this.pending=null;clearTimeout(p.timer);if(data.type==='error')p.reject(new Error(data.message));else p.resolve(data);};worker.onerror=()=>{if(this.worker===worker)this.close('Worker failed');};}
 request(message,transfers,timeout){if(!this.worker||this.pending)throw Error('Worker unavailable or busy');const id=++this.id;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>this.close('Worker timed out'),timeout);this.pending={id,resolve,reject,timer};try{this.worker.postMessage({...message,id},transfers);}catch(e){clearTimeout(timer);this.pending=null;reject(e);}});}
 async init(meta,bytes){this.start();const r=await this.request({type:'init',meta,bytes},[bytes],15000);this.ready=r.type==='ready';if(!this.ready)throw Error('Unexpected initialization response');}
 async discover(pixels,width,height,{timeout=30000}={}){if(!this.ready)throw Error('Not initialized');const r=await this.request({type:'discover',pixels,width,height},[pixels],timeout);if(r.type!=='result')throw Error('Unexpected discovery response');return r.result;}
 close(reason='Worker cancelled'){this.ready=false;this.worker?.terminate();this.worker=null;if(this.pending){const p=this.pending;this.pending=null;clearTimeout(p.timer);p.reject(new Error(reason));}}
}
