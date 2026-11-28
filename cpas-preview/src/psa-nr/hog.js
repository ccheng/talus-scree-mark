// Experimental OpenCV HOG port: 24x24 window, 12x12 block, 6x6 cells/stride, unsigned 9 bins.
export function hog324(image){
 if(image.length!==576)throw Error('Expected 24x24 grayscale glyph');
 const bins=new Uint8Array(576), frac=new Float64Array(576),mag=new Float64Array(576),sig=3;
 for(let y=0;y<24;y++)for(let x=0;x<24;x++){
  const i=y*24+x,px=x===0?1:x-1,nx=x===23?22:x+1,py=y===0?1:y-1,ny=y===23?22:y+1;
  const dx=image[y*24+nx]-image[y*24+px],dy=image[ny*24+x]-image[py*24+x];let a=Math.atan2(dy,dx)*9/Math.PI-.5;if(a<0)a+=18;let b=Math.floor(a);bins[i]=((b%9)+9)%9;frac[i]=a-b;mag[i]=Math.hypot(dx,dy);
 }
 const out=[];
 for(let bx=0;bx<=12;bx+=6)for(let by=0;by<=12;by+=6){
  const h=new Float64Array(36);
  for(let x=0;x<12;x++)for(let y=0;y<12;y++){
   const i=(by+y)*24+bx+x,b=bins[i],b2=(b+1)%9,f=frac[i],w=mag[i]*Math.exp(-((x-6)**2+(y-6)**2)/(2*sig*sig));const cx=(x+.5)/6-.5,cy=(y+.5)/6-.5,ix=Math.floor(cx),iy=Math.floor(cy),fx=cx-ix,fy=cy-iy;
   for(let ax=0;ax<2;ax++)for(let ay=0;ay<2;ay++){let u=ix+ax,v=iy+ay;if(u<0||u>1||v<0||v>1)continue;let weight=w*(ax?fx:1-fx)*(ay?fy:1-fy),j=(u*2+v)*9;h[j+b]+=weight*(1-f);h[j+b2]+=weight*f;}
  }
  let scale=1/(Math.sqrt(h.reduce((s,z)=>s+z*z,0))+3.6);for(let j=0;j<36;j++)h[j]=Math.min(.2,h[j]*scale);scale=1/(Math.sqrt(h.reduce((s,z)=>s+z*z,0))+.001);for(let j=0;j<36;j++)out.push(h[j]*scale);
 }
 return out;
}
