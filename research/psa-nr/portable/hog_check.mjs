import fs from 'node:fs';import {hog324} from './hog.mjs';
import {loadSVM} from './svm.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL(n,import.meta.url),'utf8')),f=read('hog-fixtures.json'),s=loadSVM(read('svm-meta.json'),fs.readFileSync(new URL('svm.f64',import.meta.url))),argmax=p=>p.indexOf(Math.max(...p));let max=0,err=0,probMax=0,agree=0;
for(let i=0;i<f.images.length;i++){let x=hog324(f.images[i]),y=f.descriptors[i],p=s.predictProba(x),q=s.predictProba(y);max=Math.max(max,...x.map((z,j)=>Math.abs(z-y[j])));err+=x.reduce((a,z,j)=>a+Math.abs(z-y[j]),0)/324;probMax=Math.max(probMax,...p.map((z,j)=>Math.abs(z-q[j])));agree+=argmax(p)===argmax(q)?1:0;}
console.log({n:f.images.length,max,meanAbsoluteError:err/f.images.length,probMax,agree});
