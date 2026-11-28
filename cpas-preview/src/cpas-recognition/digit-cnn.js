// Research-only digit CNN; input 28x28 float, white ink on black. No blank/dot rejection.
export function infer(input,w){
 if(input.length!==784||w.length!==9098) throw new Error('unexpected input or model length');
 let off=0;
 function conv(a,n,ci,co){const k=off;off+=co*ci*9;const b=off;off+=co;const out=new Float32Array(co*n*n);
 for(let o=0;o<co;o++)for(let y=0;y<n;y++)for(let x=0;x<n;x++){let s=w[b+o];for(let i=0;i<ci;i++)for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){let yy=y+dy,xx=x+dx;if(yy>=0&&yy<n&&xx>=0&&xx<n)s+=a[(i*n+yy)*n+xx]*w[k+((o*ci+i)*3+dy+1)*3+dx+1];}out[(o*n+y)*n+x]=Math.max(0,s);}return out;}
 function pool(a,n,c){let m=n/2,out=new Float32Array(c*m*m);for(let i=0;i<c;i++)for(let y=0;y<m;y++)for(let x=0;x<m;x++){let j=(i*n+y*2)*n+x*2;out[(i*m+y)*m+x]=Math.max(a[j],a[j+1],a[j+n],a[j+n+1]);}return out;}
 let a=pool(conv(input,28,1,8),28,8);a=pool(conv(a,14,8,16),14,16);let k=off;off+=7840;let z=[];for(let o=0;o<10;o++){let s=w[off+o];for(let i=0;i<784;i++)s+=a[i]*w[k+o*784+i];z.push(s);}return z;
}
