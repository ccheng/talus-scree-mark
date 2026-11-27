"""REG-R1/R2 research pilot: isolated same-print glyphs; no application changes.
Requires Python, numpy, opencv-python, Pillow; uses system fonts listed below.
Run: python reg_r1.py > reg_r1_results.json
"""
import json, itertools
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageDraw, ImageFont

FONTS = [
 '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
 '/usr/share/fonts/truetype/liberation2/LiberationSerif-Regular.ttf',
 '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
 '/usr/share/fonts/truetype/lato/Lato-Medium.ttf',
]
# Page-space patch spans 12 points; source print rendered at 16 pixels/point.
PP=16; W=192; C=(W-1)/2
GRID=np.linspace(-4,4,33,dtype=np.float32)
X,Y=np.meshgrid(GRID,GRID)
CHANGES={**{c:tuple(d for d in 'ABCDXEF' if d!=c) for c in 'ABCD'},
         **{c:tuple(d for d in '0123456789' if d!=c) for c in '0123456789'}}
STRATA=[('ordinary',2.8,0,0.4,6),('quarter-turn',1.8,90,0.55,8),
        ('oblique',1.5,17,0.55,9),('low-res-rotated',0.9,90,0.65,12)]

def render(font_path,glyph,kind):
    f=ImageFont.truetype(font_path,round((5.7 if kind=='digit' else 9)*PP))
    im=Image.new('L',(W,W),0); d=ImageDraw.Draw(im)
    b=d.textbbox((0,0),glyph,font=f)
    # Fixed baseline/advance; do not center each glyph by its individual bounding box.
    advance=f.getlength('0' if kind=='digit' else 'D')
    ascent,descent=f.getmetrics()
    anchor=(C-advance/2,C-(ascent-descent)/2)
    d.text(anchor,glyph,font=f,fill=255,anchor='lt') if False else d.text((anchor[0],C-(ascent+descent)/2),glyph,font=f,fill=255)
    # Center line using a common baseline, then render the bubble outline outside glyph core.
    if kind=='digit':d.ellipse((C-4.15*PP,C-4.15*PP,C+4.15*PP,C+4.15*PP),outline=255,width=round(.6*PP))
    return np.asarray(im,dtype=np.float32)/255

def camera(print_img,scale,angle,blur,noise,seed,shift=True,masked=False):
    rng=np.random.default_rng(seed); a=np.deg2rad(angle); ca,sa=np.cos(a),np.sin(a)
    dx,dy=rng.uniform(-.42,.42,2) if shift else (0.,0.)
    phase=rng.uniform(-.5,.5,2); n=int(np.ceil(8*scale))+3
    # Actual raster samples with phase, orientation, blur, translation and noise.
    if masked:
        print_img=print_img.copy(); yy,xx=np.indices(print_img.shape); print_img[(xx-C)**2+(yy-C)**2<(3.55*PP)**2]=1
    blurred=cv2.GaussianBlur(print_img,(0,0),max(.1,blur*PP))
    ix,iy=np.meshgrid(np.arange(-n,n+1,dtype=np.float32),np.arange(-n,n+1,dtype=np.float32))
    u=(ix+phase[0])/scale; v=(iy+phase[1])/scale
    xx=ca*u+sa*v-dx; yy=-sa*u+ca*v-dy
    sample=cv2.remap(blurred,(C+PP*xx).astype('float32'),(C+PP*yy).astype('float32'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    contrast=rng.uniform(.52,.93); bg=rng.uniform(.79,.99); slope=rng.uniform(-.007,.007,2)
    sensor=np.clip(bg-contrast*sample+slope[0]*xx+slope[1]*yy+rng.normal(0,noise/255,sample.shape),0,1).astype('float32')
    def get(x,y):
        x,y=np.broadcast_arrays(x,y); shape=x.shape
        u=(scale*(ca*x-sa*y)-phase[0]+n).astype('float32'); v=(scale*(sa*x+ca*y)-phase[1]+n).astype('float32')
        return cv2.remap(sensor,u.reshape(1,-1),v.reshape(1,-1),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).reshape(shape)
    return get

def patch(get,kind,dx=0.,dy=0.,blur=0.):
    if kind=='digit':
        t=np.arange(16)*np.pi/8; bg=np.median(get(5.8*np.cos(t),5.8*np.sin(t))); mask=(X*X+Y*Y<=2.8**2)
    else:
        bg=np.median(get(np.array([-5.5,5.5,-5.5,5.5]),np.array([-5.5,-5.5,5.5,5.5])));mask=np.ones_like(X,dtype=bool)
    img=np.maximum(0,bg-get(X+dx,Y+dy))
    if blur:img=cv2.GaussianBlur(img,(0,0),blur/.25)
    return img[mask]

def corr(a,b):
    a=a-a.mean();b=b-b.mean(); den=np.linalg.norm(a)*np.linalg.norm(b)
    return float(a@b/den) if den>1e-8 else 0.

def compare(ref,scan,kind,scale):
    r0=patch(ref,kind);s0=patch(scan,kind);r=patch(ref,kind,blur=max(0,.42/scale-.10))
    # Fixed bounded search, not unconstrained shape fitting.
    shifts=[patch(scan,kind,x,y) for x,y in itertools.product((-.5,0,.5),repeat=2)]
    raw=float(np.mean((r0-s0)**2)); ncc=1-max(corr(r,s) for s in shifts)
    norm=min(float(np.mean((r/max(.01,r.max())-s/max(.01,s.max()))**2)) for s in shifts)
    peak=float(s0.max()); mass=float(s0.mean()); masked=kind=='digit' and mass>.45 and mass/max(.01,peak)>.68
    effective=scale*(4.2 if kind=='digit' else 6.7)
    usable=not masked and r.max()>.12 and peak>.12 and effective>=5.
    return dict(raw=raw,ncc=ncc,norm=norm,masked=bool(masked),usable=bool(usable),effective=effective,peak=peak,mass=mass)

def run():
    rows=[]
    for fi,font in enumerate(FONTS):
        for g,others in CHANGES.items():
            kind='digit' if g.isdigit() else 'header'; images={c:render(font,c,kind) for c in (g,*others)}
            ref=camera(images[g],3.4,0,.17,2,100+fi,False)
            for si,(stratum,scale,angle,blur,noise) in enumerate(STRATA):
                for trial in range(2):
                    seed=100000*fi+10000*si+ord(g)*13+trial
                    for actual in (g,*others):
                        scan=camera(images[actual],scale,angle,blur,noise,seed)
                        rows.append(dict(font=fi,kind=kind,stratum=stratum,expected=g,actual=actual,trial=trial,changed=g!=actual,unseen=kind=='header' and actual not in 'ABCD',occluded=False,**compare(ref,scan,kind,scale)))
                    if kind=='digit' and trial==0:
                        scan=camera(images[g],scale,angle,blur,noise,seed,masked=True)
                        rows.append(dict(font=fi,kind=kind,stratum=stratum,expected=g,actual=g,trial=trial,changed=False,unseen=False,occluded=True,**compare(ref,scan,kind,scale)))
    metrics=['raw','ncc','norm']; cal=[r for r in rows if r['font']<2]; held=[r for r in rows if r['font']>=2]
    thresholds={k:{m:max(r[m] for r in cal if r['kind']==k and r['usable'] and not r['changed'] and not r['occluded'])+.01 for m in metrics} for k in ('header','digit')}
    def summary(rs):
        same=[r for r in rs if not r['changed'] and not r['occluded']]; change=[r for r in rs if r['changed']]; occluded=[r for r in rs if r['occluded']]
        result=dict(same=len(same),changed=len(change),occluded=len(occluded),usableSame=sum(r['usable'] for r in same),usableChanged=sum(r['usable'] for r in change),maskedDetected=sum(r['masked'] for r in occluded),maskedUsable=sum(r['usable'] for r in occluded))
        for m in metrics:
            def flag(r):return r['usable'] and r[m]>thresholds[r['kind']][m]
            result[m]=dict(sameFlag=sum(flag(r) for r in same),changeFlag=sum(flag(r) for r in change),unseenFlag=sum(flag(r) and r['unseen'] for r in change),unseenTotal=sum(r['unseen'] for r in change),occludedFlag=sum(flag(r) for r in occluded))
        return result
    return dict(method='isolated synthetic paired glyph sites, fonts 0/1 calibration and 2/3 held out; no page-level verdict',fonts=FONTS,thresholds=thresholds,total=len(rows),calibration=summary(cal),holdout=summary(held),byStratum={s[0]:summary([r for r in held if r['stratum']==s[0]]) for s in STRATA},byKind={k:summary([r for r in held if r['kind']==k]) for k in ('digit','header')},rows=rows)

if __name__=='__main__':print(json.dumps(run(),indent=2))
