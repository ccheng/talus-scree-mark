"""Mixed MC/NR reference probe; run with trusted prior NR synthetic model and reference source."""
import json,sys,joblib,numpy as np
from glyphs import bank
from combined import combined,reconcile_nr
from fixtures import evaluate
from cycle2 import make
from pathlib import Path
sys.path.insert(0,sys.argv[1]);from nr_reference import Reference
from dev_fixtures import make as nr_make,evalout
B,Y=bank();ref=Reference(joblib.load(sys.argv[2]));out=[]
for kinds in (['normal','separate','faint','broken'],['normal','swap','missing_decimal','outer']):
 a,t=nr_make(83041,kinds)
 # Generator also contains 22 genuine unnumbered MC rows (two 11-row blocks).
 truth=[[[82+c*29+col*195,80+r*25] for c in range(4)] for col in range(2) for r in range(11)]
 rows=combined(a,B,Y)[0];nr=ref.discover(a)['proposals'];rec=reconcile_nr(rows,nr)
 out.append(dict(kinds=kinds,mc_before=evaluate(rows,truth,4),mc_after=evaluate(rec,truth,4),nr_evaluation=evalout(nr,t),conflicts=sum(r.get('source')=='nr-overlap-conflict' for r in rec)))
 # Exercise actual accepted NR geometry as a competing MC proposal, independently of whether MC discovered it.
 for q in nr:
  if q.get('decision')=='accept' and q.get('centers') is not None:
   forced={'points':q['centers'][:4],'decision':'confirmed','observed':[True]*4}
   assert reconcile_nr([forced],nr)[0]['decision']=='review'
   out[-1]['forced_overlap_guard']='pass';break
print(json.dumps(out,indent=2));Path('nr-results.json').write_text(json.dumps(out,indent=2))
