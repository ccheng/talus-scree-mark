"""Prototype independent header/number evidence with conservative fusion.
Header first does not require rings. No entirely inferred row is confirmed.
"""
import numpy as np
from scipy.spatial import cKDTree
from mc_core import discover
from glyphs import bank,glyph_components,header_candidates

def number_anchors(glyphs,header):
    h=np.array(header['centers']);x0,y0=h[0];dx=np.median(np.diff(h[:,0]));digits=[g for g in glyphs if g[6].isdigit() and g[7]<1.7 and g[8]>.05 and x0-2.2*dx<g[0]<x0-.55*dx and y0+.4*dx<g[1]<y0+30*dx]
    groups=[]
    for g in sorted(digits,key=lambda g:g[1]):
        group=next((a for a in groups if abs(np.median([z[1] for z in a])-g[1])<.3*dx),None)
        if group is None:groups.append([g])
        else:group.append(g)
    anchors=[]
    for group in groups:
        group.sort(key=lambda g:g[0]);run=[group[-1]]
        for g in group[-2::-1]:
            if run[0][0]-g[0]>.55*dx or len(run)>=3:break
            run.insert(0,g)
        value=int(''.join(g[6] for g in run));y=float(np.median([g[1] for g in run]));x=run[-1][0]
        if 1<=value<=300:anchors.append({'number':value,'y':y,'x':x})
    # Do not trust isolated OCR results. A sequence of >=3 adjacent labels is required.
    chains=[]
    for a in anchors:
        chain=[a]
        for b in anchors:
            if b['number']==chain[-1]['number']+1 and .45*dx<b['y']-chain[-1]['y']<3.6*dx and abs(b['x']-chain[-1]['x'])<.6*dx:chain.append(b)
        chains.append(chain)
    best=max(chains,key=len,default=[])
    return best if len(best)>=3 else []

def fused(im,B,Y):
    rows,pts=discover(im);glyphs=glyph_components(im,B,Y);headers=header_candidates(glyphs);output=[];matched=set();evidence=[]
    for header in headers:
        h=np.array(header['centers']);x0,y0=h[0];dx=np.median(np.diff(h[:,0]));n=len(h);anchors=number_anchors(glyphs,header)
        if not anchors:continue
        # Require at least two independently observed complete rows to calibrate header-to-bubble offset.
        pairs=[]
        for a in anchors:
            possible=[(i,r) for i,r in enumerate(rows) if len(r['points'])==n and abs(r['points'][0][0]-x0)<.45*dx and abs(np.mean(np.array(r['points'])[:,1])-a['y'])<.4*dx]
            if len(possible)==1:pairs.append((a,*possible[0]))
        if len(pairs)<2:continue
        offsets=np.array([np.array(r['points'])-np.c_[h[:,0],np.repeat(a['y'],n)] for a,i,r in pairs]);off=np.median(offsets,axis=0)
        evidence.append({'header':header['letters'],'anchors':len(anchors),'observed_calibration_rows':len(pairs)})
        tree=cKDTree(pts[:,:2]);used=set()
        for a in anchors:
            exact=next(((i,r) for b,i,r in pairs if a is b),None)
            if exact:
                i,r=exact;matched.add(i);output.append({**r,'number':a['number'],'source':'outline+header+number'});continue
            pred=np.c_[h[:,0],np.repeat(a['y'],n)]+off;dist,idx=tree.query(pred);ok=dist<.18*dx
            for j in range(n):
                if ok[j] and int(idx[j]) in used:ok[j]=False
                if ok[j]:used.add(int(idx[j]))
            coords=[pts[k,:2].tolist() if v else p.tolist() for p,k,v in zip(pred,idx,ok)]
            output.append({'points':coords,'observed':ok.tolist(),'decision':'review','number':a['number'],'source':'header+number'})
        # Unnumbered candidates inside a complete sequential chain are questionable, not automatically confirmed.
        for i,r in enumerate(rows):
            if i in matched or len(r['points'])!=n:continue
            xy=np.array(r['points']);y=xy[:,1].mean()
            if abs(xy[0,0]-x0)<.45*dx and anchors[0]['y']<y<anchors[-1]['y']:
                matched.add(i);output.append({**r,'decision':'review','source':'unlabelled-row-conflict'})
    output.extend(r for i,r in enumerate(rows) if i not in matched)
    return output,evidence

def deskew_angle(points):
    angles=[]
    for i,a in enumerate(points):
        for b in points[i+1:]:
            dx,dy=b[:2]-a[:2]
            if dx<0:dx,dy=-dx,-dy
            r=(a[2]+b[2])/2
            if not 2.8*r<=dx<=7.5*r or abs(dy)>.19*dx or abs(a[2]-b[2])>.30*r:continue
            angles.append(np.degrees(np.arctan2(dy,dx)))
    if len(angles)<8:return 0.
    angles=np.array(angles);bins=np.arange(-10,10.1,.5);counts=np.array([np.sum(abs(angles-b)<.65) for b in bins]);b=bins[np.argmax(counts)];near=angles[abs(angles-b)<.65]
    return float(np.median(near)) if len(near)>=8 and len(near)>=.45*len(angles) and abs(np.median(near))>=.8 else 0.

def rectified_fused(im,B,Y):
    import cv2
    from mc_core import outline_candidates
    angle=deskew_angle(outline_candidates(im));h,w=im.shape
    if not angle:return (*fused(im,B,Y),0.)
    matrix=cv2.getRotationMatrix2D((w/2,h/2),angle,1);corrected=cv2.warpAffine(im,matrix,(w,h),borderValue=255);rows,e=fused(corrected,B,Y);inv=cv2.invertAffineTransform(matrix)
    for r in rows:r['points']=[(inv@[x,y,1]).tolist() for x,y in r['points']]
    return rows,e,angle
