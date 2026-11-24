"""Compare the shipped reader with two experimental alignment strategies."""
import argparse
import json
from pathlib import Path
import subprocess
from time import perf_counter

import cv2 as cv
import numpy as np

from identity import FormIdentity
from match import Reference, SCALE, page_corners, warp_points, xy

HERE = Path(__file__).resolve().parent
METHODS = ('current', 'global', 'block', 'corners-block')


def read_image(path):
    image = cv.imread(str(path))
    if image is None or max(image.shape[:2]) > 2400:
        raise ValueError(f'Expected an image already normalized to at most 2400 pixels: {path}')
    return image


def read_marks(image, profile, corners=None, transforms=None):
    h, w = image.shape[:2]
    args = dict(width=w, height=h, profile=profile, corners=corners,
                transforms=[m.flatten().tolist() for m in transforms] if transforms is not None else None)
    result = subprocess.run(['node', str(HERE/'read.mjs'), json.dumps(args)],
                            input=cv.cvtColor(image, cv.COLOR_BGR2RGBA).tobytes(), check=True, capture_output=True)
    return json.loads(result.stdout)


def measure(profile, case, matrices):
    errors = []
    predictions = []
    for block, matrix in zip(profile['components'], matrices):
        if matrix is None:
            continue
        records = [(f"{item['id']}:{c['symbol']}", c, (row+col)%3 == 0)
                   for row, item in enumerate(block['items']) for col, c in enumerate(item['choices'])]
        template = np.asarray([xy(c) for _, c, _ in records])
        predicted = warp_points(matrix, template)
        truth = case.get('centers', {})
        for index, ((key, choice, held), point) in enumerate(zip(records, predicted)):
            observed = truth.get(key)
            if held and observed:
                distances = np.linalg.norm(template-template[index], axis=1)
                nearest = int(np.argmin(np.where(distances > .01, distances, np.inf)))
                other = truth.get(records[nearest][0])
                if other:
                    radius = choice['radius']*np.linalg.norm(np.array(xy(other))-xy(observed))/distances[nearest]
                    errors.append(float(np.linalg.norm(point-xy(observed))/radius))
            predictions.append((point, observed, held))
    return errors, predictions


def overlay(image, predictions, label, observed=None):
    view = image.copy()
    for point, oracle, held in predictions:
        p = tuple(np.rint(point).astype(int))
        if oracle:
            q = tuple(np.rint(xy(oracle)).astype(int))
            cv.line(view, p, q, (245,145,28), 2, cv.LINE_AA)
            cv.circle(view, q, 3 if held else 2, (38,175,38), -1, cv.LINE_AA)
        cv.circle(view, p, 7, (30,65,235), 2, cv.LINE_AA)
    for point in observed or []:
        q = tuple(np.rint(point).astype(int))
        cv.drawMarker(view, q, (230,80,160), cv.MARKER_CROSS, 9, 2)
    # Keep the answer region legible across the side-by-side comparisons.
    if predictions:
        pts = np.asarray([p for p, _, _ in predictions])
        if np.all(np.isfinite(pts)):
            lo = np.maximum(0, np.floor(pts.min(axis=0)-45).astype(int))
            hi = np.minimum(view.shape[1::-1], np.ceil(pts.max(axis=0)+45).astype(int))
            if np.all(hi-lo > 30):
                view = view[lo[1]:hi[1], lo[0]:hi[0]]
    view = cv.resize(view, (0,0), fx=520/view.shape[1], fy=520/view.shape[1])
    view = cv.copyMakeBorder(view, 68, 20, 0, 0, cv.BORDER_CONSTANT, value=(248,248,248))
    cv.putText(view, label, (12,26), cv.FONT_HERSHEY_SIMPLEX, .58, (30,30,30), 1, cv.LINE_AA)
    cv.putText(view, 'Red: projected   Green: oracle   Purple: detected', (12,53),
               cv.FONT_HERSHEY_SIMPLEX, .46, (45,45,45), 1, cv.LINE_AA)
    return view


def run(manifest, output):
    data = json.loads(manifest.read_text())
    profile = data['profile']
    reference = Reference(read_image(manifest.parent/data['blank']), profile, data['blankCorners'])
    identity_gate = FormIdentity(reference, data.get('identity'))
    all_results = []
    output.mkdir(parents=True, exist_ok=True)
    for case in data['cases']:
        image = read_image(manifest.parent/case['image'])
        for corner_mode in ('auto', 'manual'):
            corners = case['scanCorners'] if corner_mode == 'manual' else None
            shipped = read_marks(image, profile, corners)
            auto_hint = corners or shipped.get('estimatedCorners')
            views = []
            for method in METHODS:
                evidence, details, observed = {}, [], []
                identity = {'status': 'baseline-no-gate'}
                if method == 'current':
                    result = shipped
                    guessed = np.array(result['matrix']).reshape(3,3) if result.get('matrix') else None
                    if guessed is None and auto_hint:
                        shape = profile['page']
                        guessed = cv.getPerspectiveTransform(page_corners(shape['width'], shape['height']),
                                                             np.float32(list(map(xy, auto_hint))))
                    matrices = [guessed]*len(reference.blocks)
                    elapsed = result['ms']
                else:
                    start = perf_counter()
                    transforms, coarse, details, evidence = reference.register(
                        image, auto_hint, method in ('block', 'corners-block'), corners is not None,
                        corners_only=method == 'corners-block')
                    geometry_accepted = transforms is not None
                    identity = identity_gate.verify(image, coarse, case.get('versionConfirmation')) if geometry_accepted else {
                        'status': 'geometry-rejected'}
                    identified = identity['status'] in ('verified', 'manual-confirmed', 'not-configured')
                    registration_ms = (perf_counter()-start)*1e3
                    if coarse is not None and transforms is None:
                        transforms_for_plot = []
                        for block in details:
                            shift = np.eye(3)
                            shift[:2,2] = block['correction']
                            transforms_for_plot.append(coarse@shift@np.diag([SCALE,SCALE,1]))
                        matrices = transforms_for_plot or [coarse@np.diag([SCALE,SCALE,1])]*len(reference.blocks)
                    else:
                        matrices = transforms or [None]*len(reference.blocks)
                    if coarse is not None and details:
                        detections = [point for block in details for point in block['observed'].values()]
                        observed = warp_points(coarse, detections).tolist() if detections else []
                    result = read_marks(image, profile, transforms=transforms) if geometry_accepted and identified else {
                        'accepted': False, 'items': [], 'ms': 0,
                        'reasons': [identity['status'] if geometry_accepted else evidence.get('reason')]}
                    elapsed = registration_ms + result['ms'] + shipped['hintMs']
                if method == 'current':
                    geometry_accepted = result['accepted']
                errors, prediction = measure(profile, case, matrices)
                items = result['items']
                truth = case.get('answers', {})
                checked = [item for item in items if item['id'] in truth and not item['review']]
                correct = sum(item['rawText'] == truth[item['id']] for item in checked)
                record = dict(case=case['name'], valid=case['valid'], corners=corner_mode, method=method,
                              accepted=result['accepted'], geometryAccepted=geometry_accepted, identity=identity,
                              expectedIdentity=case.get('expectedIdentity'), correct=correct, wrong=len(checked)-correct,
                              review=sum(item['review'] for item in items), expected=len(truth),
                              reasons=result.get('reasons', []), ms=round(elapsed,1),
                              p95=round(float(np.percentile(errors,95)),3) if errors else None,
                              oracleErrors=errors, evidence=evidence, blocks=details)
                all_results.append(record)
                views.append(overlay(image, prediction, f"{method} | {'accepted' if result['accepted'] else 'rejected'}", observed))
                print(case['name'], corner_mode, method, record['accepted'], correct, record['wrong'], record['review'],
                      record['p95'], record['ms'], identity['status'], record['reasons'], flush=True)
            height = max(view.shape[0] for view in views)
            montage = cv.hconcat([cv.copyMakeBorder(view,0,height-view.shape[0],0,0,cv.BORDER_CONSTANT,value=(248,248,248))
                                  for view in views])
            cv.imwrite(str(output/f"{case['name']}-{corner_mode}.png"), montage)
    (output/'results.json').write_text(json.dumps(all_results, indent=2)+'\n')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('manifest', type=Path)
    parser.add_argument('output', type=Path)
    args = parser.parse_args()
    run(args.manifest, args.output)
