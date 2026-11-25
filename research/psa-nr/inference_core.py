"""Experimental PSA core extracted from executed local prototypes.
Research only. No app integration, training data, private images or holdout seeds.
Requires numpy and opencv-python. The functions are not calibrated classifiers.
"""
import cv2
import numpy as np

def ring_evidence(im):
    a=1-im.astype(np.float32)/255
    yy,xx=np.mgrid[-11:12,-11:12]
    rr=np.hypot(xx,yy)
    maps=[]
    for rad in (5.5,6.5,7.5,8.5):
        ring=np.abs(rr-rad)<=1.15
        surround=(rr>rad+1.8)&(rr<rad+3.2)
        kernel=ring.astype('float32')/ring.sum()-surround.astype('float32')/surround.sum()
        maps.append(cv2.filter2D(a,-1,kernel.astype('float32')))
    return np.maximum.reduce(maps)

def proposals(im):
    """Grid proposal search over origin and pitch in an approximately cropped region."""
    evidence=ring_evidence(im)
    soft=cv2.dilate(evidence,np.ones((3,3),np.uint8))
    candidates=[]
    for dx in range(27,37):
        for dy in range(16,24):
            h,w=im.shape
            hh=h-9*dy-12
            ww=w-3*dx-12
            if hh<=12 or ww<=12:
                continue
            v=np.zeros((hh-12,ww-12),np.float32)
            for r in range(10):
                for c in range(4):
                    v+=soft[12+r*dy:hh+r*dy,12+c*dx:ww+c*dx]
            for _ in range(2):
                _,score,_,(x,y)=cv2.minMaxLoc(v)
                candidates.append((float(score/40),x+12,y+12,dx,dy))
                v[max(0,y-4):y+5,max(0,x-4):x+5]=-100
    candidates.sort(reverse=True)
    return evidence,candidates[:12]

def positions(h):
    _,x,y,dx,dy=h
    return np.array([(x+c*dx,y+r*dy) for r in range(10) for c in range(4)])

def semantic_score(p):
    """p: 40 by 11 predicted probabilities, expected digit r in row r."""
    return float(np.mean(np.log(np.clip(p[np.arange(40),np.repeat(np.arange(10),4)],1e-6,1))))

def exact_events(p):
    """p: N x 10 x 3 probabilities, states blank, strong, uncertain.

    Factorized event model: preserve review for every configuration that
    is neither entirely blank nor exactly one strong mark with all
    other positions blank. No correct-answer prior.
    """
    p0=np.clip(p[:,:,0],1e-9,1)
    blank=np.prod(p0,axis=1)
    single=blank[:,None]*p[:,:,1]/p0
    review=np.clip(1-blank-single.sum(1),0,1)
    return np.c_[blank,single,review]
