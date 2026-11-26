import json, numpy as np
from pathlib import Path
from glyphs import bank,glyph_components
from mc_core import discover
from combined import combined,finalize
from fresh_eval import make,score
from cycle2 import make as old_make
B,Y=bank();root=Path('native');B.astype('<f4').tofile(root/'glyph-bank.f32');(root/'glyph-bank.json').write_text(json.dumps(dict(labels=Y.tolist(),dimension=324)))
folder=Path('/tmp/mc_native_fixtures');folder.mkdir(exist_ok=True);out=[]
for group,cases in [('fresh',['clean','no-header','missing-row','partial-all','five','missing-label','gap-rings','restart','no-numbers','shadow','tiny','missing-edge']),('prior',['clean','no-header','missing-row','no-header-missing','edge-loss','gap-rings','no-header-gap','five','no-numbers','missing-label','mixed','shadow'])]:
 for i,case in enumerate(cases):
  a,t=make(7700+i,case) if group=='fresh' else old_make(case);t=t if group=='fresh' else [dict(number=None,points=p) for p in t];name=f'{group}-{case}';a.tofile(folder/(name+'.gray'));base,pts=discover(a);g=glyph_components(a,B,Y);r,_,_=combined(a,B,Y);r=finalize(r);out.append(dict(name=name,width=a.shape[1],height=a.shape[0],points=pts.tolist(),glyphs=g,truth=t,reference=r,score=score(r,t)))
(folder/'fixtures.json').write_text(json.dumps(out));print(len(out),'fixtures')
