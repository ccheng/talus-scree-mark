"""Convert a locally generated trusted synthetic SVM to a plain portable numeric model."""
import argparse, hashlib, json, joblib, numpy as np
from pathlib import Path

def export(svm, output):
    arrays=[svm.support_vectors_,svm.dual_coef_,svm.intercept_,svm.probA_,svm.probB_]
    buf=np.concatenate([a.ravel() for a in arrays]).astype('<f8').tobytes()
    output=Path(output);output.mkdir(parents=True,exist_ok=True)
    (output/'svm.f64').write_bytes(buf)
    meta=dict(version=1,sha256=hashlib.sha256(buf).hexdigest(),count=int(svm.support_vectors_.shape[0]),dimension=int(svm.support_vectors_.shape[1]),nSupport=svm.n_support_.tolist(),classes=svm.classes_.tolist(),gamma=float(svm._gamma),arrayLengths=[int(a.size) for a in arrays])
    (output/'svm-meta.json').write_text(json.dumps(meta,indent=2));return meta

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('trusted_local_model');p.add_argument('--out',default='.');a=p.parse_args()
    # Never load pickles from unknown sources. Train with train_svm.py locally.
    print(export(joblib.load(a.trusted_local_model),a.out))
