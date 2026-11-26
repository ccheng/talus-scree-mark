"""Same deterministic raster geometry as the pinned JS baseline, no private data."""
import numpy as np
CASES=['clean','gap-distractor','partial','missing-row','five-choice','mixed-nr']
def fixture(name):
    scale=1.5; im=np.full((1188,918),255,np.uint8);truth=[]
    def ring(x,y,r,fill=False,broken=False):
        for j in range(int(np.floor((y-r-1)*scale)),int(np.ceil((y+r+1)*scale))+1):
            for i in range(int(np.floor((x-r-1)*scale)),int(np.ceil((x+r+1)*scale))+1):
                dx=i/scale-x;dy=j/scale-y;d=np.hypot(dx,dy)
                if (d<=r if fill else abs(d-r)<=.65) and (not broken or np.arctan2(dy,dx)>-1.2):im[j,i]=35
    cols=5 if name=='five-choice' else 4
    for g,ys in enumerate(([90,111,153,174,195,216,237,258,279],[90,111,132,174,195])):
        for row,y in enumerate(ys):
            cs=[]
            for j in range(cols):
                x=80+g*148+j*18;cs.append([x*scale,y*scale]);
                if not(name=='partial' and g==0 and row==4 and j==2) and not(name=='missing-row' and g==0 and row==4):ring(x,y,3.5,False,name=='partial' and g==1 and row==2 and j==1)
            truth.append(cs)
        if name=='gap-distractor':
            for j in range(cols):ring(80+g*148+j*18,132 if g==0 else 153,3.5,True)
    if name=='mixed-nr':
        for k in range(2):
            x=395+k*98
            for row in range(10):
                for j in range(4):ring(x+j*13,155+row*11,3.7);ring(x+j*13,155+row*11,1,True)
            for j in [1,2]:ring(x+j*13,144,3.7)
    return im,truth

def evaluate(rows,truth,tol):
    matched=set();hits=0
    for t in truth:
        for i,r in enumerate(rows):
            if i not in matched and len(r['points'])==len(t) and np.linalg.norm(np.array(r['points'])-t,axis=1).max()<tol:
                hits+=1;matched.add(i);break
    return {'mapped':hits,'proposed':len(rows),'wrong':len(rows)-hits,'review':sum(r['decision']=='review' for r in rows)}
