
import { refineSlot,translate } from './nr-local-pose.js';
export function experiment({predict,evaluateCompletion,readBubbleRegions,measureNumericalBlankInk}){
 const segs={a:[-.26,-.48,.26,-.48],b:[.26,-.48,.26,0],c:[.26,0,.26,.48],d:[-.26,.48,.26,.48],e:[-.26,0,-.26,.48],f:[-.26,-.48,-.26,0],g:[-.26,0,.26,0]};
 const digits=['abcdef','bc','abdeg','abcdg','bcfg','acdfg','acdefg','abc','abcdefg','abcdfg'];
 const dist=(x,y,[a,b,c,d])=>{const t=Math.max(0,Math.min(1,((x-a)*(c-a)+(y-b)*(d-b))/((c-a)**2+(d-b)**2)));return Math.hypot(x-a-t*(c-a),y-b-t*(d-b))};
 const rows=[],scenarios=[{id:'clean',d:[0,0]},{id:'shift-small',d:[.6,-.36]},{id:'shift-large',d:[1.2,-.72]},{id:'slot-drift',d:[1,-.65],drift:true},{id:'split-shift',d:[.8,.6],split:true},{id:'faint-outline',d:[.8,-.6],faint:true},{id:'missing-rings',d:[.8,.6],missing:true},{id:'outside-bound',d:[2.4,-1.5]},{id:'rejected',d:[.8,-.6],reject:true}];
 for(const [family,scale,radius,pitch] of [[0,1.5,3.6,8.6],[1,2.4,3.4,8.2],[2,3,4.1,10.3]]){
  let item={id:'NR1',kind:'nr',slots:Array.from({length:4},(_,j)=>({id:'S'+j,choices:Array.from({length:10},(_,k)=>({symbol:String(k),x:21+j*16,y:17+k*pitch,radius}))}))};
  const truth=[{symbol:'3',eligible:true,mode:'dark'},{symbol:'7',eligible:true,mode:'light'},{symbol:null,eligible:true,mode:'blank'},{symbol:'8',eligible:false,mode:'half'}],matrix=[scale,0,8,0,scale,8,0,0,1];
  function local(s,j,k){const [dx,dy]=s.d;return s.split&&k%2?[-dx,-dy]:s.drift?[dx*(j%2?1:-1),dy*(j<2?1:-1)]:[dx,dy]}
  function render(s,blank=false){
   const width=Math.ceil(91*scale+16),height=Math.ceil((35+10*pitch)*scale+16),values=new Uint8Array(width*height);
   for(let y=0;y<height;y++)for(let x=0;x<width;x++)values[y*width+x]=Math.round(239+8*(x/width-.5)+5*Math.sin(y/height*3));
   for(const [j,slot] of item.slots.entries())for(const [k,b] of slot.choices.entries()){
    const [dx,dy]=blank?[0,0]:local(s,j,k),cx=(b.x+dx)*scale+8,cy=(b.y+dy)*scale+8,r=b.radius*scale;
    for(let yy=Math.max(0,Math.floor(cy-r-2));yy<Math.min(height,Math.ceil(cy+r+3));yy++)for(let xx=Math.max(0,Math.floor(cx-r-2));xx<Math.min(width,Math.ceil(cx+r+3));xx++){
     let a=0;for(const ox of [-.25,.25])for(const oy of [-.25,.25]){
      const x=(xx+ox-cx)/r,y=(yy+oy-cy)/r,rr=Math.hypot(x,y);
      let ink=Math.abs(rr-1)<.32/b.radius?(s.missing&&k%3!==0?0:s.faint?.19:.9):0;
      if(digits[k].split('').some(z=>dist(x,y,segs[z])<.085))ink=Math.max(ink,.85);
      if(!blank&&truth[j].symbol===b.symbol&&rr<.86)ink=Math.max(ink,truth[j].mode==='dark'?.85:truth[j].mode==='light'?.19:x<0?.85:0);
      a+=ink/4;
     }values[yy*width+xx]=Math.round(values[yy*width+xx]*(1-a)+30*a);
    }
   }return {gray:{width,height,values},pageToSource:matrix,status:'registered'};
  }
  const blank=render(scenarios[0],true);item=measureNumericalBlankInk(blank.gray,matrix,[{id:'NR',kind:'nr',items:[item]}])[0].items[0];
  for(const s of scenarios){const scan=render(s),reg={status:s.reject?'rejected':'registered',pageToSource:matrix};
   for(const [j,slot] of item.slots.entries()){
    const t=truth[j],refine=refineSlot(scan.gray,reg,slot.choices),offset=local(s,j,0);
    const beforeError=slot.choices.reduce((sum,_,k)=>sum+Math.hypot(...local(s,j,k)),0)/slot.choices.length;
    const afterError=slot.choices.reduce((sum,_,k)=>{const [x,y]=local(s,j,k);return sum+Math.hypot(x-(refine.dx??0),y-(refine.dy??0))},0)/slot.choices.length;
    const record={family,scale,scenario:s.id,slot:j,...t,beforeError,afterError,refine:refine.status,dx:refine.dx??0,dy:refine.dy??0,methods:{}};
    if(!s.reject){const one={...item,slots:[slot]},profile={components:[{id:'NR',kind:'nr',items:[one]}]};
     const poses={baseline:matrix,refined:refine.matrix??matrix,...(!s.split?{oracle:translate(matrix,...offset)}:{})};
     for(const [name,m] of Object.entries(poses)){
      const est=readBubbleRegions(scan.gray,m,[one]),e=est[0].slots[0];
      const c=evaluateCompletion(scan.gray,profile,{status:'registered',pageToSource:m},{reference:blank,predict,established:est}).items[0].slots[0];
      record.methods[name]={est:{accepted:!e.review&&['single','blank'].includes(e.status),symbol:e.symbol,status:e.status},cpas:{accepted:['single','blank'].includes(c.optical)&&c.evidenceComplete,symbol:c.symbol,status:c.optical}};
     }
    }rows.push(record);
   }
  }
 }
 const summaries={};for(const r of rows){const z=summaries[r.scenario]??={n:0,proposed:0,before:0,after:0,methods:{}};z.n++;z.proposed+=r.refine==='proposed';z.before+=r.beforeError;z.after+=r.afterError;
  for(const [pose,m] of Object.entries(r.methods))for(const [engine,v] of Object.entries(m)){const n=z.methods[pose+'/'+engine]??={correct:0,wrong:0,violations:0,withheld:0};if(!v.accepted)n.withheld++;else if(!r.eligible)n.violations++;else if(v.symbol===r.symbol)n.correct++;else n.wrong++}
 }for(const z of Object.values(summaries)){z.before/=z.n;z.after/=z.n}
 return {summaries,rows,limitations:'Authored synthetic grid, known true translation, repeated glyphs and generator; no real captures, local projective or nonlinear validation, complete NR response admission, iPhone timing or independent reserve. CPAS literal advisory only. Fits use disjoint ring halves with consensus, not independent validation.'};
}
