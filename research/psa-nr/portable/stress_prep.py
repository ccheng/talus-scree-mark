"""Generate local stress rasters from a supplied image; keep the outputs private."""
import argparse,json,cv2,numpy as np
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('photo');p.add_argument('out');a=p.parse_args();out=Path(a.out).resolve();out.mkdir(exist_ok=True,parents=True);im=cv2.imread(a.photo,0);assert im is not None;h,w=im.shape;s=min(1,2000/h,2000/w);im=cv2.resize(im,(round(w*s),round(h*s)),interpolation=cv2.INTER_AREA);h,w=im.shape
corners=np.float32([[0,0],[w-1,0],[w-1,h-1],[0,h-1]]);rows=[]
def emit(label,gray):
 path=out/(label+'.raw');path.write_bytes(gray.tobytes());rows.append(dict(id=label,w=gray.shape[1],h=gray.shape[0],path=str(path)))
emit('original',im);emit('half_resolution',cv2.resize(im,(w//2,h//2),interpolation=cv2.INTER_AREA));emit('rotation_5deg',cv2.warpAffine(im,cv2.getRotationMatrix2D((w/2,h/2),5,1),(w,h),borderValue=248));
for k in [.035,.08]:
 dst=np.float32([[w*k,h*k],[w*(1-k),0],[w-1,h*(1-k)],[0,h-1]]);emit(f'perspective_{k}',cv2.warpPerspective(im,cv2.getPerspectiveTransform(corners,dst),(w,h),borderValue=248))
emit('blank',np.full((h,w),248,np.uint8));(out/'manifest.json').write_text(json.dumps(rows))
