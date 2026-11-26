"""Generate new public development fixtures and Python reference values for JavaScript.
Not an independent benchmark. Run with a locally generated trusted SVM only.
"""
from pathlib import Path
import sys,json,joblib,numpy as np
from scipy.optimize import linear_sum_assignment
from nr_reference import Reference,headers,page_blobs,header_proposals,proposals,merge,features,decide
from dev_fixtures import make,evalout
from train_svm import data
from export_model import export

P=Path(__file__).resolve().parent
def plain(x):
 if isinstance(x,np.ndarray):return x.tolist()
 if isinstance(x,np.generic):return x.item()
 raise TypeError(type(x))

def sequence(p):
 D=np.log(np.clip(p,1e-5,1)).reshape(10,4,10).mean(1);diag=np.diag(D);alt=[]
 for i in range(10):
  q=D.copy();q[i,i]=-1e4;a,b=linear_sum_assignment(-q);alt.append(q[a,b].sum())
 return dict(svm_margin=float(diag.sum()-max(alt)),svm_repeat_margin=float((diag-D.max(1)).sum()),svm_wins=int((D.argmax(1)==np.arange(10)).sum()),svm_expected=float(diag.mean()))

if __name__=='__main__':
 # Deliberately public development-only seeds, different from past holdouts.
 svm=joblib.load(sys.argv[1]);r=Reference(svm);export(svm,P);rows=[];results=[]
 cases=[(['normal','separate','faint','broken'],0,False),(['normal','shift_col','outer','missing_decimal'],2,True),(['normal','swap','shift_header','normal'],-3,True),([],0,False)]
 for i,(ks,angle,project) in enumerate(cases):
  im,truth=make(170020+i*97,ks,angle,project);hs,cells=headers(im);b=page_blobs(im);h,_=header_proposals(im,b);d,_,_=proposals(im);dec=[dict(score=q[0],coef=np.array(q[1:4]),positions=q[4],path='decimal') for q in d];merged=merge([dict(q,path='header') for q in h]+dec);out=r.discover(im);ev=[dict(evidence=q['evidence'],decision=q['decision']) for q in out['proposals']];rows.append(dict(id=i,blobs=b,cells=cells,headers=hs,header=h,decimal=dec,merged=merged,decisions=ev));z=evalout(out['proposals'],truth);results.append(dict(id=i,valid=sum(t['valid'] for t in truth),mapped=sum(q['exact42'] and q['decision'] in ('accept','review') for q in z),accepted=sum(q['exact42'] and q['decision']=='accept' for q in z),wrong_accepted=sum(not q['exact42'] and q['decision']=='accept' for q in z)));print(results[-1],flush=True)
 (P/'features.json').write_text(json.dumps(rows,default=plain,separators=(',',':')))
 (P/'dev-reference-results.json').write_text(json.dumps(results,indent=2))
 X,y=data(2,100,170111);D=features(X);p=svm.predict_proba(D);(P/'svm-fixtures.json').write_text(json.dumps(dict(descriptors=D.tolist(),expected=p.tolist(),labels=y.tolist(),sequence=[sequence(p[:40]),sequence(p[40:80])]),separators=(',',':')))
