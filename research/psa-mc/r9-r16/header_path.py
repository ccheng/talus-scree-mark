"""Header-led path does not need a number or complete lattice seed."""
import numpy as np
from scipy.spatial import cKDTree
from mc_core import outline_candidates
from glyphs import glyph_components,header_candidates

def header_rows(im,B,Y):
 pts=outline_candidates(im);headers=header_candidates(glyph_components(im,B,Y));out=[]
 for hd in headers:
  h=np.array(hd['centers']);x=h[:,0];y=h[:,1].mean();n=len(x);dx=np.median(np.diff(x));p=pts[(pts[:,1]>y+.5*dx)&(pts[:,1]<y+28*dx)&(np.min(abs(pts[:,0,None]-x),axis=1)<.23*dx)]
  if len(p)<2*(n-1):continue
  groups=[]
  for q in sorted(p,key=lambda q:q[1]):
   if groups and abs(q[1]-np.median([z[1] for z in groups[-1]]))<.20*dx:groups[-1].append(q)
   else:groups.append([q])
  rows=[]
  for g in groups:
   g=np.array(g);yy=np.median(g[:,1]);pred=np.c_[x,np.repeat(yy,n)];dist,idx=cKDTree(g[:,:2]).query(pred);ok=dist<.22*dx
   if ok.sum()<n-1:continue
   rows.append(dict(points=[g[k,:2].tolist() if b else a.tolist() for a,k,b in zip(pred,idx,ok)],observed=ok.tolist(),decision='review' if not ok.all() else 'confirmed',source='header+outline'))
  if len(rows)>=2:out.extend(rows)
 return out
