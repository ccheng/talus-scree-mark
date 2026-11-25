"""Evaluate corroborating motion of printed lines outside response blocks."""
import argparse
import json
from pathlib import Path

import cv2 as cv
import numpy as np

SCALE = 2
cv.setNumThreads(1)


def rectify(image, matrix, size):
    return cv.warpPerspective(image, np.linalg.inv(matrix), size, borderValue=255)


def page_matrix(page, corners):
    w, h = page['width'], page['height']
    return cv.getPerspectiveTransform(np.float32([(0,0),(w,0),(w,h),(0,h)]),
                                      np.float32([(p['x'], p['y']) for p in corners]))


def image(path):
    result = cv.imread(str(path), cv.IMREAD_GRAYSCALE)
    if result is None:
        raise ValueError(f'Image unavailable: {path}')
    return result


def proximity(point, bounds):
    x, y = point / SCALE
    bx, by, w, h = (bounds[k] for k in ('x', 'y', 'width', 'height'))
    return np.hypot(max(0,bx-x,x-bx-w), max(0,by-y,y-by-h))


def reference(manifest):
    data = json.loads(manifest.read_text())
    p = data['profile']
    page = p['page']
    size = (round(page['width']*SCALE), round(page['height']*SCALE))
    blank = rectify(image(manifest.parent/data['blank']),
                    page_matrix(page, data['blankCorners']) @ np.diag([1/SCALE,1/SCALE,1]), size)
    ink = cv.adaptiveThreshold(blank, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 33, 15)
    # Isolate long, straight print. Nearby words, numbers and bubble outlines
    # do not qualify as landmarks.
    rules = cv.bitwise_or(cv.morphologyEx(ink, cv.MORPH_OPEN, np.ones((1,40), np.uint8)),
                         cv.morphologyEx(ink, cv.MORPH_OPEN, np.ones((40,1), np.uint8)))
    mask = cv.dilate(rules, np.ones((7,7), np.uint8))
    for b in p['components']:
        x,y,w,h = (round(b['bounds'][k]*SCALE) for k in ('x','y','width','height'))
        cv.rectangle(mask, (x-12,y-12),(x+w+12,y+h+12),0,-1)
    points = cv.goodFeaturesToTrack(blank, 240, .012, 23, mask=mask, blockSize=7)
    sites = np.rint(points.reshape(-1,2)).astype(int) if points is not None else np.empty((0,2), int)
    return data, blank, {b['id']: [v for v in sites if proximity(v,b['bounds']) <= 70]
                         for b in p['components']}


def anchor_matches(blank, scan, sites, shift):
    matches = []
    for x,y in sites:
        radius,pad = 12,20
        r = radius+pad
        if x<r or y<r or x+r>=scan.shape[1] or y+r>=scan.shape[0]:
            continue
        patch = blank[y-radius:y+radius+1, x-radius:x+radius+1]
        if np.std(patch) < 24:
            continue
        window = scan[y-r:y+r+1,x-r:x+r+1]
        scores = cv.matchTemplate(window, patch, cv.TM_CCOEFF_NORMED)
        _,best,_,(px,py) = cv.minMaxLoc(scores)
        if best < .78 or abs(px-pad) == pad or abs(py-pad) == pad:
            continue
        candidate = scores.copy()
        candidate[max(0,py-3):py+4,max(0,px-3):px+4] = -1
        if best-candidate.max() < .045:
            continue
        sx,sy = np.clip(np.rint(shift*SCALE).astype(int)+pad, 0, 2*pad)
        aligned = np.max(scores[max(0,sy-2):sy+3,max(0,sx-2):sx+3])
        observed = (np.array([px,py])-pad)/SCALE
        disagree = np.linalg.norm(observed-shift) > 3 and best-aligned > .16
        matches.append({'xy': [int(x),int(y)], 'observed': observed.tolist(),
                        'best': round(best,3), 'at_correction': round(float(aligned),3), 'contradicts': bool(disagree)})
    return matches


def run(trace):
    references = {}
    for line in Path(trace).read_text().splitlines():
        record = json.loads(line)
        if 'fixture' not in record:
            continue
        manifest = Path(record['manifest'])
        if manifest not in references:
            references[manifest] = reference(manifest)
        data,blank,sites = references[manifest]
        anchors = {}
        blocks = record.get('refined') or []
        if blocks:
            case = next(c for c in data['cases'] if c['name'] == record['fixture'])
            photo = image(manifest.parent/case['image'])
            first = blocks[0]
            inverse_shift = np.array([[1,0,-first['dx']],[0,1,-first['dy']],[0,0,1]])
            pose = np.array(first['matrix']).reshape(3,3)@inverse_shift@np.diag([1/SCALE,1/SCALE,1])
            scan = rectify(photo, pose, blank.shape[::-1])
            for b in blocks:
                anchors[b['id']] = anchor_matches(blank, scan, sites[b['id']], np.array([b['dx'],b['dy']]))
        veto = any(sum(m['contradicts'] for m in group)>=2 for group in anchors.values())
        print(json.dumps({'manifest': str(manifest), 'fixture': record['fixture'], 'manual': record['manual'],
                          'valid': record['valid'], 'original': record['status']=='read',
                          'accepted': record['status']=='read' and not veto,
                          'landmarks': {id:len(group) for id,group in sites.items()},
                          'matches': anchors}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('trace')
    run(parser.parse_args().trace)
