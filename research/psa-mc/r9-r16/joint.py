"""Independent printed-number chains and competing grid hypotheses. Research only."""
import numpy as np
from scipy.spatial import cKDTree
from mc_core import discover
from glyphs import glyph_components,header_candidates

def tokens(glyphs):
 d=[g for g in glyphs if g[6].isdigit() and g[7]<1.7 and g[8]>.05];out=[]
 def adjacent(a,b):return .1*a[3]<b[0]-a[0]<.9*a[3] and abs(a[1]-b[1])<.25*a[3] and .65<b[3]/a[3]<1.5
 for g in d:
  if any(adjacent(g,b) for b in d):continue
  run=[g]
  while len(run)<3:
   left=[b for b in d if adjacent(b,run[0])]
   if not left:break
   run.insert(0,max(left,key=lambda z:z[0]))
  n=int(''.join(z[6] for z in run))
  if 1<=n<=300:out.append((n,g[0]+g[2]/2,float(np.median([z[1] for z in run])),g[3]))
 return out

def chains(ts):
 ts=sorted(ts,key=lambda t:t[2]);paths=[]
 for i,b in enumerate(ts):
  best=(1.,[i])
  for j,a in enumerate(ts[:i]):
   h=(a[3]+b[3])/2;dn=b[0]-a[0];dy=b[2]-a[2]
   if 1<=dn<=3 and .8*h<=dy<=8*h*dn and abs(a[1]-b[1])<.55*h:
    score=paths[j][0]+1-.3*(dn-1)
    if score>best[0]:best=(score,paths[j][1]+[i])
  paths.append(best)
 out=[];used=set()
 for score,p in sorted(paths,reverse=True):
  if len(p)>=3 and not used.intersection(p):out.append([ts[i] for i in p]);used.update(p)
 return out

def hypotheses(path,pts,headers,local_affine=False):
 if not len(pts):return []
 x=np.median([t[1] for t in path]);h=np.median([t[3] for t in path]);ys=np.array([t[2] for t in path]);local=pts[(pts[:,0]>x+.4*h)&(pts[:,0]<x+18*h)&(np.min(abs(pts[:,1,None]-ys),axis=1)<.5*h)]
 if len(local)<6:return []
 tree=cKDTree(local[:,:2]);seeds=[];out=[]
 for hd in headers:
  v=np.array(hd['centers']);dx=np.median(np.diff(v[:,0]))
  if x+.4*h<v[0,0]<x+5*h and ys.min()-8*h<v[0,1]<ys.min()-.5*h:seeds.append((v[0,0],dx,len(v),True))
 for a in local:
  if not x+.4*h<a[0]<x+5*h:continue
  for b in local:
   dx=b[0]-a[0];r=(a[2]+b[2])/2
   if abs(a[1]-b[1])>.45*h or not 2.5*r<dx<8*r:continue
   for shift in (0,1,2):
    origin=a[0]-shift*dx
    if x+.4*h<origin<x+5*h:
     for n in (4,5):seeds.append((origin,dx,n,False))
 seen=set()
 for x0,dx,n,header in seeds:
  key=(round(x0/2),round(dx/2),n)
  if key in seen:continue
  seen.add(key);coords=np.stack(np.meshgrid(x0+np.arange(n)*dx,ys),-1);dist,idx=tree.query(coords);ok=dist<max(2,.22*dx)
  if (ok.sum(1)>=n-1).sum()<2:continue
  coords+=np.median((local[idx,:2]-coords)[ok],axis=0);dist,idx=tree.query(coords);ok=dist<max(2,.20*dx)
  # Optional bounded local affine refinement, based only on independently observed centers.
  if local_affine and ok.sum()>=2*n and len(np.unique(np.where(ok)[0]))>=3:
   A=np.stack(np.meshgrid(np.arange(n),ys-ys.mean()),-1);A=np.concatenate([np.ones((*A.shape[:2],1)),A],axis=2)
   if np.linalg.matrix_rank(A[ok])==3:
    coef=np.linalg.lstsq(A[ok],local[idx,:2][ok],rcond=None)[0];pred=A@coef
    if .8*dx<=coef[1,0]<=1.2*dx and abs(coef[1,1])<=.15*dx and abs(coef[2,0])<=.10 and .85<=coef[2,1]<=1.15 and np.max(np.linalg.norm(pred-coords,axis=2))<=.45*dx:
     d2,i2=tree.query(pred);m2=d2<max(2,.20*dx)
     if m2.sum()>=ok.sum():coords,idx,ok=pred,i2,m2
  score=float((ok.sum(1)>=n-1).sum()*2+(ok.sum(1)==n).sum()*2+ok.sum()*.20-(~ok).sum()*.40+header*5)
  out.append((score,n,header,coords,ok,idx,local,x0,dx))
 return sorted(out,key=lambda q:-q[0])

def joint(im,B,Y,number_only=False,local_affine=False):
 base,pts=discover(im);glyphs=glyph_components(im,B,Y);headers=header_candidates(glyphs);paths=chains(tokens(glyphs));out=[];used=set();details=[]
 for path in paths:
  hyps=hypotheses(path,pts,[] if number_only else headers,local_affine)
  if not hyps:continue
  score,n,header,coords,ok,idx,local,x0,dx=hyps[0];amb=any(q[0]>=score-1.5 and (q[1]!=n or abs(q[7]-x0)>.45*dx) for q in hyps[1:]);details.append(dict(labels=[a[0] for a in path],choices=n,header=header,hypotheses=len(hyps),ambiguous=amb))
  for k,(a,p,m,indices) in enumerate(zip(path,coords,ok,idx)):
   # An OCR-only row needs adjacent consecutive labels with independently observed outlines on both sides.
   # Do not extrapolate zero-outline rows at sequence endpoints (e.g. a header glyph read as 8).
   if not m.any() and not (0<k<len(path)-1 and path[k-1][0]+1==a[0]==path[k+1][0]-1 and ok[k-1].sum()>=n-1 and ok[k+1].sum()>=n-1):
    details[-1].setdefault('unsupported_labels',[]).append(a[0]);continue
   xy=np.array([local[k,:2] if v else z for z,k,v in zip(p,indices,m)]);out.append(dict(points=xy.tolist(),observed=m.tolist(),number=a[0],decision='confirmed' if m.all() and not amb else 'review',source='number+grid'))
   for i,r in enumerate(base):
    old=np.array(r['points']);
    if abs(old[:,1].mean()-xy[:,1].mean())<.3*dx and abs(old[:,0].mean()-xy[:,0].mean())<dx:used.add(i)
  for i,r in enumerate(base):
   if i in used:continue
   xy=np.array(r['points']);y=xy[:,1].mean()
   if abs(xy[0,0]-x0)<.45*dx and any(a[0]+1==b[0] and a[2]+.35*dx<y<b[2]-.35*dx for a,b in zip(path,path[1:])):used.add(i);out.append(dict(r,decision='review',source='sequence-conflict'))
 out.extend(r for i,r in enumerate(base) if i not in used)
 return out,details,headers
