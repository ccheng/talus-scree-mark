
 // Grayscale block-DCT quantization proxy, with standard luminance table and no JPEG bitstream.
 export function quantizeBlocks(gray,quality=55){
 const Q=[16,11,10,16,24,40,51,61,12,12,14,19,26,58,60,55,14,13,16,24,40,57,69,56,14,17,22,29,51,87,80,62,18,22,37,56,68,109,103,77,24,35,55,64,81,104,113,92,49,64,78,87,103,121,120,101,72,92,95,98,112,100,103,99];
 const k=quality<50?5000/quality:200-2*quality,qs=Q.map(q=>Math.max(1,Math.min(255,Math.floor((q*k+50)/100))));
 const C=Array.from({length:8},(_,u)=>Array.from({length:8},(_,x)=>.5*(u===0?Math.SQRT1_2:1)*Math.cos((2*x+1)*u*Math.PI/16)));
 const {width:w,height:h,values:v}=gray,out=v.slice(),tmp=new Float64Array(64),coef=new Float64Array(64),tmp2=new Float64Array(64);
 for(let Y=0;Y<h;Y+=8)for(let X=0;X<w;X+=8){
  for(let y=0;y<8;y++)for(let u=0;u<8;u++){let s=0;for(let x=0;x<8;x++)s+=C[u][x]*(v[Math.min(h-1,Y+y)*w+Math.min(w-1,X+x)]-128);tmp[y*8+u]=s}
  for(let z=0;z<8;z++)for(let u=0;u<8;u++){let s=0;for(let y=0;y<8;y++)s+=C[z][y]*tmp[y*8+u];coef[z*8+u]=Math.round(s/qs[z*8+u])*qs[z*8+u]}
  for(let y=0;y<8;y++)for(let u=0;u<8;u++){let s=0;for(let z=0;z<8;z++)s+=C[z][y]*coef[z*8+u];tmp2[y*8+u]=s}
  for(let y=0;y<8&&Y+y<h;y++)for(let x=0;x<8&&X+x<w;x++){let s=128;for(let u=0;u<8;u++)s+=C[u][x]*tmp2[y*8+u];out[(Y+y)*w+X+x]=Math.max(0,Math.min(255,Math.round(s)))}
 }return {...gray,values:out};
 }
 // Authored curved-stroke digit paths, not a real font or handwriting corpus.
 export const glyphs=[[[0,-.47],[-.24,-.35],[-.29,0],[-.23,.35],[0,.47],[.23,.35],[.29,0],[.24,-.35],[0,-.47]], [[-.17,-.26],[.03,-.47],[.03,.47],[-.19,.47],[.23,.47]], [[-.25,-.27],[-.15,-.46],[.13,-.46],[.27,-.28],[.22,-.06],[-.25,.45],[.28,.45]], [[-.24,-.38],[.08,-.47],[.26,-.28],[.05,-.02],[.24,.11],[.26,.32],[.05,.47],[-.24,.37]], [[.15,.47],[.15,-.46],[-.29,.13],[.30,.13]], [[.25,-.46],[-.23,-.46],[-.25,-.04],[.10,-.04],[.28,.16],[.20,.40],[-.02,.47],[-.25,.35]], [[.22,-.39],[-.04,-.46],[-.25,-.21],[-.27,.22],[-.12,.45],[.15,.43],[.28,.23],[.19,.02],[-.04,-.03],[-.25,.12]], [[-.29,-.46],[.29,-.46],[-.09,.47]], [[0,-.46],[-.23,-.35],[-.23,-.15],[.22,.16],[.25,.34],[0,.47],[-.25,.34],[-.22,.16],[.23,-.15],[.23,-.35],[0,-.46]], [[.25,.02],[.06,.13],[-.22,.04],[-.27,-.23],[-.10,-.46],[.16,-.43],[.27,-.21],[.25,.23],[.04,.46],[-.22,.37]]];
 export function glyphInk(symbol,u,v,family){
 if(symbol==='.')return Math.hypot(u,v-.37)<.085;
 const pts=glyphs[Number(symbol)],w=.055+(family%3)*.014;
 const x=u*(family%2?1.15:.92)-.13*v,y=v*(family%3===0?1.13:1);
 return pts.slice(1).some(([b,d],i)=>{const [a,c]=pts[i],t=Math.max(0,Math.min(1,((x-a)*(b-a)+(y-c)*(d-c))/((b-a)**2+(d-c)**2)));return Math.hypot(x-a-t*(b-a),y-c-t*(d-c))<w});
 }
