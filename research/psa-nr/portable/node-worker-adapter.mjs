// Node test shim, not a browser runtime or a production dependency.
import {parentPort} from 'node:worker_threads';
import {webcrypto} from 'node:crypto';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
globalThis.self=globalThis;globalThis.postMessage=(m)=>parentPort.postMessage(m);
await import('./worker.mjs');parentPort.on('message',data=>globalThis.onmessage({data}));
