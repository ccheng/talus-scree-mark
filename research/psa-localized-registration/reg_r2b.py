"""REG-R2B frozen-threshold NR mark-aware observability ablation.
Research port of observeBubble's sampling formula from marks.js at 7c9251ba.
Not an execution of the JavaScript reader; no group-level calibration assumed.
Run after reg_r2.py: python reg_r2b.py > reg_r2b_results.json
"""
import json,math
import numpy as np
from reg_r1 import render,FONTS
from reg_r2 import capture,native_compare,STRATA,SUB,bucket

FAMILIES=['/usr/share/fonts/truetype/noto/NotoSerif-Regular.ttf','/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf']
A=np.arange(24)*np.pi/12
CORES=np.array([(x,y) for y in np.arange(-.66,.67,.22) for x in np.arange(-.66,.67,.22) if np.hypot(x,y)<=.68])

def quantile(a,f):return np.sort(a)[math.floor((len(a)-1)*f)]

def observe(capture):
    get=capture['get'];radius=4.15
    if capture['scale']*radius<2.5:return None
    bg=quantile(get(radius*1.55*np.cos(A),radius*1.55*np.sin(A)),.53)
    outline=np.min([get(radius*r*np.cos(A),radius*r*np.sin(A)) for r in (.84,.96,1.08,1.20)],axis=0)
    contrast=bg-quantile(outline,.27)
    support=np.mean(bg-outline>=max(20/255,contrast*.3))
    if contrast<28/255 or support<.5:return None
    return float(np.mean(np.clip((bg-get(radius*CORES[:,0],radius*CORES[:,1]))/contrast,0,1)))

def run():
    # Frozen R2 calibration thresholds: no use of the new evaluation fonts.
    thresholds={'high':.33508140802383424,'medium':.26748610496520997,'low':None};rows=[]
    for fi,font in enumerate(FAMILIES):
        for g in '0123456789':
            imgs={c:render(font,c,'digit') for c in (g,*SUB[g])}
            ref=capture(imgs[g],3.4,0,.17,2,87+fi,reference=True);blank=observe(ref)
            for si,(stratum,scale,angle,blur,noise) in enumerate(STRATA):
                for trial in range(2):
                    seed=1700000+fi*100000+si*10000+ord(g)*13+trial
                    cond='faint' if stratum=='faint' else 'clean';cases=[(c,cond) for c in (g,*SUB[g])]
                    if trial==0 and cond=='clean':cases.extend((g,c) for c in ('full-mark','partial-mark','erasure'))
                    for actual,condition in cases:
                        scan=capture(imgs[actual],scale,angle,blur,noise,seed,condition);raw=observe(scan);n=native_compare(ref,scan,'digit')
                        calibrated=blank is not None and .035<=blank<=.72 and raw is not None
                        delta=raw-blank if calibrated else None;fill=max(0,delta/(1-blank)) if calibrated else None
                        # Use the production maximumBlankFill threshold. A separate fixed
                        # negative-residual gate is experimental, not production logic.
                        blank_gate=bool(calibrated and fill<=.105)
                        signed_gate=bool(blank_gate and delta>=-.10)
                        t=thresholds[bucket(scale*4.2,'digit')];flag=bool(n['nativeUsable'] and t is not None and n['native']>t)
                        rows.append(dict(font=fi,expected=g,actual=actual,condition=condition,stratum=stratum,trial=trial,changed=g!=actual,blank=blank,raw=raw,fill=fill,delta=delta,flag=flag,blankGate=blank_gate,signedGate=signed_gate))
    def summarize(rs):
        return dict(total=len(rs),nativeFlag=sum(r['flag'] for r in rs),blankGateFlags=sum(r['flag'] and r['blankGate'] for r in rs),signedGateFlags=sum(r['flag'] and r['signedGate'] for r in rs),blankGateAvailable=sum(r['blankGate'] for r in rs),signedGateAvailable=sum(r['signedGate'] for r in rs))
    groups={k:[r for r in rows if r['condition']==k] for k in ('full-mark','partial-mark','erasure')}
    groups['same']=[r for r in rows if r['condition'] in ('clean','faint') and not r['changed']];groups['changed']=[r for r in rows if r['changed']]
    return dict(method='frozen native threshold with research port of production per-bubble score; isolated glyphs; two previously unused fonts',fonts=FAMILIES,total=len(rows),thresholds=thresholds,groups={k:summarize(v) for k,v in groups.items()},rows=rows)

if __name__=='__main__':print(json.dumps(run(),indent=2))
