"""Conservative union: independent header-only additions remain provisional."""
import numpy as np
from joint import joint
from header_path import header_rows
from mc_core import discover
from glyphs import glyph_components

def overlap(a,b):
 a,b=np.array(a['points']),np.array(b['points']);pitch=max(1,np.median(np.linalg.norm(np.diff(a,axis=0),axis=1)));d=np.linalg.norm(a[:,None,:]-b[None,:,:],axis=2)
 return (d.min(1)<.25*pitch).sum()>=min(len(a),len(b))-1

def combined(im,B,Y,svm=None,mode='template',number=True,header=True):
 if im.ndim!=2 or im.dtype!=np.uint8 or min(im.shape)<32 or max(im.shape)>2400 or im.size>4000000:raise ValueError('Expected bounded grayscale raster')
 base,pts=discover(im);glyphs=glyph_components(im,B,Y,svm,mode)
 rows,details,headers=joint(im,B,Y,features=(base,pts,glyphs)) if number else (base,[],[])
 for r in (header_rows(im,B,Y,features=(pts,glyphs)) if header else []):
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

def finalize(rows):
 """Explicitly separate geometry from completeness. No unnumbered family is automatic."""
 out=[]
 for r in rows:
  p=np.asarray(r['points']);pitch=float(np.median(np.linalg.norm(np.diff(p,axis=0),axis=1)));n=len(p)
  anchored=any('number' in q and len(q['points'])==n and abs(q['points'][0][0]-p[0,0])<.35*pitch for q in rows)
  reasons=[] if r['decision']=='confirmed' else [r.get('source','partial-outline')]
  if not anchored:reasons.append('question-count-unverified')
  out.append(dict(r,decision='review' if reasons else 'confirmed',review_reasons=reasons,geometry_observed=all(r['observed']),number_provenance='ocr-suggestion' if 'number'in r else 'unassigned'))
 return out

def arbitrate(rows,proposals):
 """Prefer a strong accepted NR interpretation only over unnumbered conflicting MC. Keep evidence for review."""
 out=[]
 for r in finalize(rows):
  pts=np.asarray(r['points']);pitch=max(1,float(np.median(np.linalg.norm(np.diff(pts,axis=0),axis=1))));hits=[]
  for q in proposals:
   e=q.get('evidence',{});nr_like=e.get('support',0)>=32 and e.get('header',0)>=.30 and e.get('svm_wins',0)>=7 and e.get('axes',1)<=.25
   if q.get('centers') is None or not(q.get('decision')=='accept' or nr_like):continue
   d=np.linalg.norm(pts[:,None,:]-np.asarray(q['centers'])[None,:,:],axis=2);n=int((d.min(1)<.25*pitch).sum())
   if n>=min(3,len(pts)):hits.append((n,q.get('decision')))
  if hits:
   preference='nr-preferred' if 'number' not in r and any(n==len(pts) and status=='accept' for n,status in hits) else 'unresolved'
   r=dict(r,decision='review',arbitration=preference,review_reasons=[*r['review_reasons'],'nr-overlap-conflict'])
  out.append(r)
 return out
