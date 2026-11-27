"""REG-R2 native-pixel vs rectified sampling and observability pilot.
Run: python reg_r2.py > reg_r2_results.json
Dependencies and print rendering from reg_r1.py. No app code changed.
"""
import itertools,json,math
import numpy as np
import cv2
from reg_r1 import render,PP,C,W,patch,corr,compare,CHANGES,FONTS

# The two original calibration families and two previously unused families.
# Holdout families are distinct from R1's holdout; calibration never sees holdout scores.
FAMILIES=FONTS[:2]+['/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf','/usr/share/fonts/truetype/freefont/FreeSerif.ttf']
STRATA=[('ordinary',2.8,0,.35,5),('quarter-turn',1.8,90,.50,8),('oblique',1.5,17,.55,9),('low-res',.9,90,.65,12),('faint',2.4,180,.45,10)]
SUB={'A':('B','X'),'B':('D','E'),'C':('D','X'),'D':('B','E'),'0':('8','6'),'1':('7','4'),'2':('3','7'),'3':('8','5'),'4':('9','1'),'5':('6','3'),'6':('8','0'),'7':('1','2'),'8':('9','0'),'9':('8','4')}

def capture(im,scale,angle,blur,noise,seed,condition='clean',reference=False):
    rng=np.random.default_rng(seed); a=np.deg2rad(angle); ca,sa=np.cos(a),np.sin(a)
    dx,dy=(0.,0.) if reference else rng.uniform(-.42,.42,2)
    phase=rng.uniform(-.5,.5,2); n=int(np.ceil(8*scale))+3
    im=im.copy();yy,xx=np.indices(im.shape);xx=(xx-C)/PP;yy=(yy-C)/PP
    if condition=='full-mark': im[xx*xx+yy*yy<3.55**2]=1
    if condition=='partial-mark': im[(np.abs(yy-.5*xx-.2)<.35)&(xx*xx+yy*yy<3.5**2)]=.78
    if condition=='erasure': im[(xx-.3)**2+(yy+.5)**2<1.8**2]*=.3
    blurred=cv2.GaussianBlur(im,(0,0),max(.1,blur*PP))
    ix,iy=np.meshgrid(np.arange(-n,n+1,dtype=np.float32),np.arange(-n,n+1,dtype=np.float32))
    u=(ix+phase[0])/scale;v=(iy+phase[1])/scale
    x=(ca*u+sa*v).astype('float32');y=(-sa*u+ca*v).astype('float32')
    values=cv2.remap(blurred,(C+PP*(x-dx)).astype('float32'),(C+PP*(y-dy)).astype('float32'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_CONSTANT)
    contrast=rng.uniform(.19,.37) if condition=='faint' else rng.uniform(.52,.93)
    bg=rng.uniform(.79,.99); slope=rng.uniform(-.007,.007,2)
    sensor=np.clip(bg-contrast*values+slope[0]*x+slope[1]*y+rng.normal(0,noise/255,values.shape),0,1).astype('float32')
    def get(x,y):
        x,y=np.broadcast_arrays(x,y); shape=x.shape
        u=(scale*(ca*x-sa*y)-phase[0]+n).astype('float32');v=(scale*(sa*x+ca*y)-phase[1]+n).astype('float32')
        return cv2.remap(sensor,u.reshape(1,-1),v.reshape(1,-1),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE).reshape(shape)
    return dict(get=get,x=x,y=y,sensor=sensor,scale=scale)

def native_compare(ref,scan,kind):
    # Only the camera transform, enrolled raster and observed pixels are inputs.
    # No oracle displacement or true blur. Approximate bandwidth from sampling density.
    scale=scan['scale'];x,y=scan['x'],scan['y'];rad=np.hypot(x,y)
    inside=(rad<=2.8) if kind=='digit' else ((np.abs(x)<=4)&(np.abs(y)<=4))
    background=(rad>=5.4)&(rad<=6.4)
    bg=float(np.median(scan['sensor'][background])); observed=np.maximum(0,bg-scan['sensor'])
    bnoise=float(1.4826*np.median(np.abs(scan['sensor'][background]-bg)))
    # Reconstruct the enrolled raster on a fine grid, then bandwidth-match it before
    # projecting onto the actual scan pixel lattice; no scan-to-page interpolation.
    axis=np.linspace(-7,7,113,dtype=np.float32); gx,gy=np.meshgrid(axis,axis)
    refgray=ref['get'](gx,gy); refbg=float(np.median(refgray[np.hypot(gx,gy)>5.5]))
    refink=np.maximum(0,refbg-refgray)
    sigma=max(.18,.26+.22/scale); refink=cv2.GaussianBlur(refink,(0,0),sigma/.125)
    def expected(dx,dy):
        return cv2.remap(refink,((x-dx+7)/.125).astype('float32'),((y-dy+7)/.125).astype('float32'),cv2.INTER_LINEAR,borderMode=cv2.BORDER_REPLICATE)
    shifts=list(itertools.product((-.5,-.25,0,.25,.5),repeat=2))
    if kind=='digit':
        ring=(rad>=3.1)&(rad<=4.95)
        # Determine local pose from the ring, independently of the glyph under test.
        ring_scores=[corr(expected(dx,dy)[ring],observed[ring]) for dx,dy in shifts]
        j=int(np.argmax(ring_scores));dx,dy=shifts[j];ring_corr=ring_scores[j]
        # Bounded, ring-anchored subpixel refinement; no unrestricted glyph alignment.
        local=[(dx+u,dy+v) for u,v in itertools.product((-.125,0,.125),repeat=2) if abs(dx+u)<=.625 and abs(dy+v)<=.625]
    else:
        local=shifts;ring_corr=1.
    scores=[corr(expected(dx,dy)[inside],observed[inside]) for dx,dy in local]
    score=1-max(scores); peak=float(observed[inside].max()); mass=float(observed[inside].mean())
    masked=kind=='digit' and mass>.42 and mass/max(.01,peak)>.65
    # Independent scan-quality features; no ground-truth symbol or condition in the decision.
    effective=scale*(4.2 if kind=='digit' else 6.7)
    usable=not masked and effective>=5 and peak>=.12 and peak/max(.012,bnoise)>=4.5 and ring_corr>=.55
    return dict(native=score,nativeUsable=bool(usable),nativeMasked=bool(masked),ringCorr=float(ring_corr),snr=peak/max(.012,bnoise))

def run():
    rows=[]
    for fi,font in enumerate(FAMILIES):
        for g,alts in SUB.items():
            kind='digit' if g.isdigit() else 'header'; imgs={c:render(font,c,kind) for c in (g,*alts)}
            ref=capture(imgs[g],3.4,0,.17,2,51+fi,reference=True)
            for si,(stratum,scale,angle,blur,noise) in enumerate(STRATA):
                for trial in range(2):
                    seed=700000+fi*100000+si*10000+ord(g)*13+trial
                    cond='faint' if stratum=='faint' else 'clean'
                    cases=[(c,cond) for c in (g,*alts)]
                    if kind=='digit' and trial==0 and cond=='clean':cases.extend((g,c) for c in ('full-mark','partial-mark','erasure'))
                    for actual,condition in cases:
                        scan=capture(imgs[actual],scale,angle,blur,noise,seed,condition)
                        p=compare(ref['get'],scan['get'],kind,scale); n=native_compare(ref,scan,kind)
                        rows.append(dict(font=fi,kind=kind,stratum=stratum,expected=g,actual=actual,trial=trial,condition=condition,changed=g!=actual,**p,**n))
    cal=[r for r in rows if r['font']<2];held=[r for r in rows if r['font']>=2]
    good=lambda r:r['condition'] in ('clean','faint')
    metrics={'rectified':'ncc','native':'native'}; thresholds={}
    for method,metric in metrics.items():
        uk='usable' if method=='rectified' else 'nativeUsable';thresholds[method]={}
        # Calibrate by site type and acquisition density class. Faint and regular share their density class.
        for kind in ('header','digit'):
            for band in ('high','medium','low'):
                vals=[r[metric] for r in cal if r['kind']==kind and bucket(r['effective'],kind)==band and good(r) and not r['changed'] and r[uk]]
                thresholds[method][kind+'/'+band]=max(vals)+.01 if vals else None
    def summarize(rs):
        same=[r for r in rs if good(r) and not r['changed']];ch=[r for r in rs if r['changed']];occ=[r for r in rs if not good(r)]
        out=dict(same=len(same),changed=len(ch),occluded=len(occ))
        for method,metric in metrics.items():
            uk='usable' if method=='rectified' else 'nativeUsable'
            def available(r):return r[uk] and thresholds[method][r['kind']+'/'+bucket(r['effective'],r['kind'])] is not None
            def flag(r):return available(r) and r[metric]>thresholds[method][r['kind']+'/'+bucket(r['effective'],r['kind'])]
            out[method]=dict(sameUsable=sum(available(r) for r in same),changeUsable=sum(available(r) for r in ch),sameFlag=sum(flag(r) for r in same),changeFlag=sum(flag(r) for r in ch),occludedUsable=sum(available(r) for r in occ),occludedFlag=sum(flag(r) for r in occ))
        return out
    return dict(method='isolated native-pixel pilot; new font holdouts; thresholds calibrated only on first two fonts; no app or page verdict',fonts=FAMILIES,total=len(rows),thresholds=thresholds,calibration=summarize(cal),holdout=summarize(held),byStratum={s[0]:summarize([r for r in held if r['stratum']==s[0]]) for s in STRATA},byKind={k:summarize([r for r in held if r['kind']==k]) for k in ('digit','header')},byOcclusion={k:summarize([r for r in held if r['condition']==k]) for k in ('full-mark','partial-mark','erasure')},rows=rows)

def bucket(effective,kind):
    scale=effective/(4.2 if kind=='digit' else 6.7)
    return 'high' if scale>=2 else 'medium' if scale>=1.2 else 'low'

if __name__=='__main__': print(json.dumps(run(),indent=2))
