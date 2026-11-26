"""MC-R development prototype: empty-circle evidence + observed-row lattice seeds.
All coordinates are raster pixels. No product integration. Inferred points always provisional.
"""
import cv2, numpy as np, itertools
from scipy.spatial import cKDTree
cv2.setNumThreads(1)

def radial(im,x,y,r):
    theta=np.arange(48)*2*np.pi/48
    radii=np.array([0,.25,.50,.68,.78,.90,1.,1.1,1.22,1.45,1.65])
    xx=(x+r*radii[:,None]*np.cos(theta)).astype('float32')
    yy=(y+r*radii[:,None]*np.sin(theta)).astype('float32')
    q=cv2.remap(im,xx,yy,cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT,borderValue=255).astype(float)
    bg=np.percentile(q[[0,1,2,9,10]],80)
    dark=np.clip((bg-q)/max(bg,50),0,1)
    rim=dark[4:9].max(0); interior=dark[:3].mean(); exterior=dark[9:].mean()
    coverage=float((rim>.13).mean()); contrast=float(rim.mean())
    return coverage, float(interior),float(exterior),contrast

def outline_candidates(im):
    h,w=im.shape; scale=min(h,w); out=[]
    for bw in (cv2.threshold(im,0,255,cv2.THRESH_BINARY_INV|cv2.THRESH_OTSU)[1],cv2.adaptiveThreshold(im,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,max(15,int(scale*.025)//2*2+1),5)):
        cnts,_=cv2.findContours(bw,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for c in cnts:
            if len(c)<5:continue
            (x,y),(a,b),_=cv2.fitEllipse(c);r=(a+b)/4
            if not scale*.0027<=r<=scale*.012 or min(a,b)/max(a,b)<.67:continue
            if cv2.contourArea(c)<.35*np.pi*r*r:continue
            cov,inside,outside,contrast=radial(im,x,y,r)
            if cov>=.65 and inside<=.12 and outside<=.17 and contrast>=.15:
                score=cov+contrast-inside-outside
                out.append((float(x),float(y),float(r),score))
    out.sort(key=lambda p:-p[3]);keep=[]
    for p in out:
        if not any(np.hypot(p[0]-q[0],p[1]-q[1])<max(2,.65*min(p[2],q[2])) for q in keep):keep.append(p)
    return np.array(keep).reshape(-1,4)

def row_proposals(im,points):
    if len(points)<4:return []
    tree=cKDTree(points[:,:2]); seeds=[]
    for i,j in itertools.combinations(range(len(points)),2):
        a,b=points[i],points[j]
        if b[0]<a[0]:a,b=b,a
        dx,dy=b[:2]-a[:2];r=(a[2]+b[2])/2
        if not 2.8*r<=dx<=7.5*r or abs(dy)>max(1.5,.17*dx) or abs(a[2]-b[2])>.35*r:continue
        step=np.array([dx,dy]);origin=a[:2]
        for n in (5,4):
            coords=origin+np.arange(n)[:,None]*step
            d,idx=tree.query(coords)
            ok=(d<=max(1.6,.32*r)) & (abs(points[idx,2]-r)<=.40*r)
            if ok.all() and len(set(idx))==n:
                seeds.append((coords,idx,r,dx,n));break
    # cluster fully observed runs into column families; require repeated row evidence
    families=[]
    for coords,idx,r,dx,n in sorted(seeds,key=lambda q:(-q[4],q[0][0,0],q[0][0,1])):
        x,y=coords[0];found=None
        for f in families:
            if f['n']==n and abs(f['x']-x)<=max(2,.43*r) and abs(f['dx']-dx)<=max(1.5,.14*dx):found=f;break
        if found is None:found={'n':n,'x':x,'dx':dx,'seeds':[]};families.append(found)
        if not any(abs(y-s[0][0,1])<r for s in found['seeds']):found['seeds'].append((coords,idx,r,dx,n))
    families=[f for f in families if len(f['seeds'])>=2]
    families.sort(key=lambda f:-(len(f['seeds'])*f['n']))
    used=set();rows=[]
    for f in families:
        ss=[s for s in f['seeds'] if not any(int(i) in used for i in s[1])]
        if len(ss)<2:continue
        ss.sort(key=lambda s:s[0][0,1]); n=f['n'];r=float(np.median([s[2] for s in ss]));base=np.median(np.stack([points[s[1],0] for s in ss]),0)
        # All complete rows retain detected centers; no insertion based only on vertical pitch.
        out=[]
        for s in ss:
            out.append({'points':points[s[1],:2].tolist(),'observed':[True]*n,'decision':'confirmed'});used.update(map(int,s[1]))
        # Locate partial rows from actual remaining circles in the same horizontal columns.
        ymin,ymax=ss[0][0][0,1],ss[-1][0][0,1];dy=np.diff([s[0][0,1] for s in ss]);pitch=float(np.median(dy))
        possible=[i for i,p in enumerate(points) if i not in used and ymin-pitch*.8<=p[1]<=ymax+pitch*.8 and min(abs(base-p[0]))<max(2,.55*r) and abs(p[2]-r)<.45*r]
        while possible:
            i=possible[0];y=points[i,1]; group=[j for j in possible if abs(points[j,1]-y)<max(2,.55*r)];possible=[j for j in possible if j not in group]
            y=float(np.median(points[group,1])); chosen=[]
            for x in base:
                opts=[j for j in group if abs(points[j,0]-x)<max(2,.55*r)]
                chosen.append(min(opts,key=lambda j:abs(points[j,0]-x)) if opts else None)
            count=sum(j is not None for j in chosen)
            if count<n-1:continue
            if any(abs(np.mean(np.array(z['points'])[:,1])-y)<r for z in out):continue
            out.append({'points':[points[j,:2].tolist() if j is not None else [float(x),y] for x,j in zip(base,chosen)],'observed':[j is not None for j in chosen],'decision':'review'});used.update(j for j in chosen if j is not None)
        rows.extend(out)
    return sorted(rows,key=lambda row:(round(row['points'][0][0]/10),row['points'][0][1]))

def discover(im):
    pts=outline_candidates(im);return row_proposals(im,pts),pts
