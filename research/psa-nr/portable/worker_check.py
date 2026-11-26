"""Offline Chromium smoke test, public synthetic fixtures only. No app changes."""
import argparse,functools,http.server,json,threading,tempfile,shutil,os
from pathlib import Path
from playwright.sync_api import sync_playwright
p=argparse.ArgumentParser();p.add_argument('manifest');p.add_argument('--chromium',default='/usr/bin/chromium');a=p.parse_args();base=Path(__file__).resolve().parent
files=json.loads(Path(a.manifest).read_text());files=[f for f in files if f['id']!='private']
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args):pass
with tempfile.TemporaryDirectory() as d:
 root=Path(d)
 for name in ('worker-client.mjs','worker.mjs','geometry.mjs','pixels.mjs','verifier.mjs','hog.mjs','svm.mjs','svm-meta.json','svm.f64'):shutil.copyfile(base/name,root/name)
 for i,f in enumerate(files):shutil.copyfile(f['path'],root/f'{i}.raw')
 (root/'index.html').write_text('<!doctype html><meta charset="utf-8"><title>NR research test</title>')
 server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=d));threading.Thread(target=server.serve_forever,daemon=True).start()
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=a.chromium,headless=True,args=['--no-sandbox']);page=b.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/');result=page.evaluate('''async (dims)=>{const {NRWorker}=await import('./worker-client.mjs');const meta=await (await fetch('./svm-meta.json')).json(),model=await (await fetch('./svm.f64')).arrayBuffer(),imgs=await Promise.all(dims.map((_,i)=>fetch(`./${i}.raw`).then(r=>r.arrayBuffer())));let w=new NRWorker(),out={};try{let corrupt=model.slice(0);new Uint8Array(corrupt)[0]^=1;try{await w.init(meta,corrupt);out.corruptRejected=false;}catch(e){out.corruptRejected=true;}try{await w.init({...meta,gamma:1},model.slice(0));out.metadataRejected=false;}catch(e){out.metadataRejected=true;}await w.init(meta,model.slice(0));let start=performance.now();let cancelled=w.discover(imgs[0].slice(0),dims[0][0],dims[0][1]);w.close();try{await cancelled;out.cancelRejected=false;}catch(e){out.cancelRejected=true;}await w.init(meta,model.slice(0));let timeout=w.discover(imgs[0].slice(0),dims[0][0],dims[0][1],{timeout:1});try{await timeout;out.timeoutRejected=false;}catch(e){out.timeoutRejected=true;}await w.init(meta,model.slice(0));out.rows=[];for(let i=0;i<dims.length;i++){let t=performance.now(),r=await w.discover(imgs[i],dims[i][0],dims[i][1]);out.rows.push({id:i,status:r.status,decisions:r.proposals.map(q=>q.decision),centers:r.proposals.map(q=>q.centers),decimals:r.proposals.map(q=>q.decimals),ms:performance.now()-t});}return out;}finally{w.close();}}''',[[f['w'],f['h']] for f in files]);b.close()
 server.shutdown()
# Evaluate all 42 centers on the exact synthetic reference. A review is not an accepted layout.
import math
for row,f in zip(result['rows'],files):
 matched=set();confirmed=set();bad=0
 for d,c,e in zip(row['decisions'],row.pop('centers'),row.pop('decimals')):
  if c is None or e is None or len(c+e)!=42:
   bad+=d=='accept';continue
  ds=[max(math.hypot(p[0]-q[0],p[1]-q[1]) for p,q in zip(c+e,t['points']))/t['pitch'] for t in f['truth']]
  i=min(range(len(ds)),key=ds.__getitem__) if ds else -1
  valid=i>=0 and f['truth'][i]['valid'] and ds[i]<=.25
  if valid and d!='reject':matched.add(i)
  if valid and d=='accept':confirmed.add(i)
  if d=='accept' and not valid:bad+=1
 row.update(valid=sum(t['valid'] for t in f['truth']),mapped42=len(matched),confirmed=len(confirmed),falseAccept=bad)
print(json.dumps(result,indent=2))
assert all(result[k] for k in ['corruptRejected','metadataRejected','cancelRejected','timeoutRejected'])
assert all(r['valid']==r['mapped42'] and r['falseAccept']==0 and r['status']=='ok' for r in result['rows'])
