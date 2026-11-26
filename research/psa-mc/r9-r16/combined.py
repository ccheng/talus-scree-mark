"""Conservative union: independent header-only additions remain provisional."""
import numpy as np
from joint import joint
from header_path import header_rows

def overlap(a,b):
 a,b=np.array(a['points']),np.array(b['points']);pitch=max(1,np.median(np.linalg.norm(np.diff(a,axis=0),axis=1)));d=np.linalg.norm(a[:,None,:]-b[None,:,:],axis=2)
 return (d.min(1)<.25*pitch).sum()>=min(len(a),len(b))-1

def combined(im,B,Y):
 rows,details,headers=joint(im,B,Y)
 for r in header_rows(im,B,Y):
  hits=[a for a in rows if overlap(a,r)]
  if hits:
   for a in hits:
    if len(a['points'])!=len(r['points']):a['decision']='review';a['source']='choice-count-conflict'
   continue
  rows.append(dict(r,decision='review',source='independent-header-recovery'))
 return rows,details,headers

def reconcile_nr(rows,proposals):
 """Accepted NR or strongly corroborated NR-like geometry may challenge MC; never delete."""
 out=[]
 for r in rows:
  points=np.array(r['points']);pitch=max(1,np.median(np.linalg.norm(np.diff(points,axis=0),axis=1)));conflict=False
  for p in proposals:
   e=p.get('evidence',{}); nr_like=(e.get('support',0)>=32 and e.get('header',0)>=.30 and e.get('svm_wins',0)>=7 and e.get('axes',1)<=.25)
   if p.get('centers') is None or not (p.get('decision')=='accept' or nr_like):continue
   nr=np.array(p['centers']);d=np.linalg.norm(points[:,None,:]-nr[None,:,:],axis=2)
   if (d.min(1)<.25*pitch).sum()>=min(3,len(points)):conflict=True
  out.append(dict(r,decision='review',source='nr-overlap-conflict') if conflict else r)
 return out
