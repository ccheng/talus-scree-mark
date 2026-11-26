import sys,json,joblib
from glyphs import bank
from combined import combined,arbitrate
from fresh_eval import score
from pathlib import Path
sys.path.insert(0,sys.argv[1]);from nr_reference import Reference
from dev_fixtures import make
B,Y=bank();ref=Reference(joblib.load(sys.argv[2]));out=[]
for seed,kinds in [(93117,['normal','faint','separate','broken']),(93118,['normal','swap','outer','missing_decimal'])]:
 a,t=make(seed,kinds);truth=[dict(number=None,points=[[82+c*29+col*195,80+r*25] for c in range(4)]) for col in range(2) for r in range(11)];rows=combined(a,B,Y)[0];nr=ref.discover(a)['proposals'];rec=arbitrate(rows,nr);out.append(dict(seed=seed,kinds=kinds,before=score(rows,truth),after=score(rec,truth),conflicts=sum('arbitration'in x for x in rec),preferred=sum(x.get('arbitration')=='nr-preferred' for x in rec),nr_decisions=[q.get('decision') for q in nr]));print(out[-1],flush=True)
Path('arbitration-results.json').write_text(json.dumps(out,indent=2))
