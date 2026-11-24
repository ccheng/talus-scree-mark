"""Offline MC registration prototype. Coordinates in the matcher are raster pixels."""
import cv2 as cv
import numpy as np

SCALE = 2
SIFT = cv.SIFT_create(nfeatures=1800)
cv.setNumThreads(1)
cv.setRNGSeed(17)


def xy(point):
    return (point['x'], point['y'])


def warp_points(matrix, points):
    return cv.perspectiveTransform(np.asarray(points, dtype=np.float32).reshape(-1, 1, 2), matrix).reshape(-1, 2)


def gray(image):
    return cv.cvtColor(image, cv.COLOR_BGR2GRAY)


def page_corners(width, height):
    return np.float32([(0, 0), (width, 0), (width, height), (0, height)])


def homography(source, target, tolerance):
    if len(source) < 4:
        return None, None
    return cv.findHomography(np.float32(source), np.float32(target), cv.RANSAC, tolerance)


def plausible_page(matrix, page, shape):
    divisors = np.c_[page, np.ones(len(page))] @ matrix[2]
    if np.any(np.abs(divisors) < 1e-8) or np.any(np.sign(divisors) != np.sign(divisors[0])):
        return False
    corners = warp_points(matrix, page)
    area = cv.contourArea(corners, oriented=True)
    height, width = shape
    return cv.isContourConvex(corners) and .10*width*height < area < 1.5*width*height


def junctions(image):
    detected = cv.createLineSegmentDetector().detect(image)[0]
    if detected is None:
        return np.empty((0, 2))
    lines = detected.reshape(-1, 4)
    lengths = np.linalg.norm(lines[:, :2] - lines[:, 2:], axis=1)
    lines = lines[np.argsort(lengths)[-120:]]
    points = []
    for i, first in enumerate(lines):
        p, d = first[:2], first[2:] - first[:2]
        if np.linalg.norm(d) < 18:
            continue
        for second in lines[:i]:
            q, e = second[:2], second[2:] - second[:2]
            cross = d[0]*e[1] - d[1]*e[0]
            if abs(cross) < .55 * np.linalg.norm(d) * np.linalg.norm(e) or np.linalg.norm(e) < 18:
                continue
            offset = q - p
            t = (offset[0]*e[1] - offset[1]*e[0]) / cross
            u = (offset[0]*d[1] - offset[1]*d[0]) / cross
            point = p + t*d
            if -.10 <= t <= 1.10 and -.10 <= u <= 1.10 and all(np.linalg.norm(point-k) > 5 for k in points):
                points.append(point)
    return np.asarray(points).reshape(-1, 2)


def nearest(expected, observed, limit):
    if not len(observed) or not len(expected):
        return {}
    distances = np.linalg.norm(expected[:, None] - observed[None, :], axis=2)
    forward, reverse = distances.argmin(axis=1), distances.argmin(axis=0)
    return {i: j for i, j in enumerate(forward) if reverse[j] == i and distances[i, j] <= np.broadcast_to(limit, (len(expected),))[i]}


def rings(image, radius_range):
    # An exterior contour also describes a filled bubble, so the result need
    # not depend on the student's answer pattern.
    ink = cv.adaptiveThreshold(image, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY_INV, 31, 15)
    contours, _ = cv.findContours(ink, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE)
    proposals = []
    for contour in contours:
        x, y, w, h = cv.boundingRect(contour)
        radius = (w+h)/4
        if not radius_range[0] <= radius <= radius_range[1] or not .71 < w/h < 1.41:
            continue
        area = cv.contourArea(contour)
        perimeter = cv.arcLength(contour, True)
        if not perimeter or 4*np.pi*area/perimeter**2 < .66:
            continue
        moments = cv.moments(contour)
        proposals.append((area, np.array([moments['m10']/area, moments['m01']/area])))
    centers = []
    for _, point in sorted(proposals, key=lambda entry: -entry[0]):
        if all(np.linalg.norm(point-q) > 3 for q in centers):
            centers.append(point)
    return np.asarray(centers).reshape(-1, 2)


class Reference:
    def __init__(self, image, profile, corners):
        page = profile['page']
        self.width, self.height = int(page['width']*SCALE), int(page['height']*SCALE)
        self.size = (self.width, self.height)
        self.page = page_corners(*self.size)
        self.image = cv.warpPerspective(gray(image), cv.getPerspectiveTransform(np.float32(list(map(xy, corners))), self.page),
                                        self.size, borderValue=255)
        self.blocks = profile['components']
        if any(block['kind'] != 'mc' for block in self.blocks):
            raise ValueError('The experiment scores MC profiles only.')
        self.choices = [[choice for item in block['items'] for choice in item['choices']] for block in self.blocks]
        self.points = [np.float32([xy(c) for c in choices])*SCALE for choices in self.choices]
        self.radii = [np.float32([c['radius'] for c in choices])*SCALE for choices in self.choices]
        self.mask = np.full(self.image.shape, 255, dtype=np.uint8)
        for points, radii in zip(self.points, self.radii):
            for pt, radius in zip(points, radii):
                cv.circle(self.mask, tuple(np.rint(pt).astype(int)), round(radius*1.65), 0, -1)
        self.keypoints, self.descriptors = SIFT.detectAndCompute(self.image, self.mask)
        self.junctions = junctions(self.image)
        self.patches = self.identity_patches()

    def identity_patches(self):
        # The answer interiors and their outlines are excluded. Sample printed
        # appearance at a fixed set of horizontal tiles across the form.
        output = []
        for y in range(30, self.height-50, 30):
            for x in range(22, self.width-100, 85):
                patch = self.image[y:y+36, x:x+85]
                if np.all(self.mask[y:y+36, x:x+85]) and np.mean(patch < 180) >= .045:
                    output.append((x, y, patch))
        return output

    def global_fit(self, scan, corners, manual):
        keypoints, desc = SIFT.detectAndCompute(scan, None)
        if self.descriptors is None or desc is None or min(len(desc), len(self.descriptors)) < 2:
            return None, {'reason': 'too-few-keypoints'}
        matcher = cv.BFMatcher()
        reverse = {a.queryIdx: a.trainIdx for a, b in matcher.knnMatch(desc, self.descriptors, k=2) if a.distance < .76*b.distance}
        matches = [a for a, b in matcher.knnMatch(self.descriptors, desc, k=2)
                   if a.distance < .76*b.distance and reverse.get(a.trainIdx) == a.queryIdx]
        matches.sort(key=lambda item: (self.keypoints[item.queryIdx].pt[1], self.keypoints[item.queryIdx].pt[0]))
        source = np.asarray([self.keypoints[m.queryIdx].pt for m in matches], dtype=np.float32).reshape(-1, 2)
        target = np.asarray([keypoints[m.trainIdx].pt for m in matches], dtype=np.float32).reshape(-1, 2)
        held = np.arange(len(matches)) % 4 == 0
        evidence = {'siftMatches': len(matches), 'lineMatches': 0, 'heldOutFeatures': int(sum(held))}
        fitting_source, fitting_target = source[~held], target[~held]
        matrix, inliers = homography(fitting_source, fitting_target, 5)
        if matrix is None or inliers.sum() < 8:
            if not corners:
                return None, {**evidence, 'reason': 'too-few-global-inliers'}
            matrix = cv.getPerspectiveTransform(self.page, np.float32(list(map(xy, corners))))
        if not plausible_page(matrix, self.page, scan.shape):
            return None, {**evidence, 'reason': 'implausible-global-pose'}
        inv = np.linalg.inv(matrix)
        rectified = cv.warpPerspective(scan, inv, self.size, borderValue=255)
        observed = junctions(rectified)
        pairs = nearest(self.junctions, observed, 12)
        evidence['lineMatches'] = len(pairs)
        if len(pairs) >= 3:
            evidence['usedLinePoints'] = len(pairs)
            fitting_source = np.concatenate((fitting_source, [self.junctions[i] for i in pairs]))
            fitting_target = np.concatenate((fitting_target, warp_points(matrix, [observed[j] for j in pairs.values()])))
            combined, combined_inliers = homography(fitting_source, fitting_target, 5)
            if combined is not None and combined_inliers.sum() >= 8 and plausible_page(combined, self.page, scan.shape):
                matrix = combined
        if manual and corners:
            # Corners propose a pose and constrain grossly incompatible fits,
            # while stable print is free to correct moderate margin errors.
            correction = np.linalg.norm(warp_points(matrix, self.page) - np.float32(list(map(xy, corners))), axis=1)
            if np.max(correction) > min(scan.shape)*.15:
                return None, {**evidence, 'reason': 'corner-feature-conflict'}
        if sum(held) < 4:
            return None, {**evidence, 'reason': 'too-few-held-out-features'}
        residuals = np.linalg.norm(warp_points(np.linalg.inv(matrix), target[held]) - source[held], axis=1)
        close = source[held][residuals <= 12]
        coverage = np.ptp(close, axis=0) / np.float32(self.size) if len(close) else np.zeros(2)
        evidence['featureCoverage'] = coverage.tolist()
        if len(close) < 4 or min(coverage) < .17 or len(close) < .65*sum(held):
            return None, {**evidence, 'reason': 'held-out-feature-geometry'}
        return matrix, evidence

    def register(self, scan, corners, refine, manual, corners_only=False):
        image = gray(scan)
        if corners_only:
            if not corners:
                return None, None, [], {'reason': 'no-corner-hint'}
            matrix = cv.getPerspectiveTransform(self.page, np.float32(list(map(xy, corners))))
            evidence = {'pose': 'supplied-corners' if manual else 'detected-corners'}
            if not plausible_page(matrix, self.page, image.shape):
                return None, None, [], {**evidence, 'reason': 'implausible-global-pose'}
        else:
            matrix, evidence = self.global_fit(image, corners, manual)
        if matrix is None:
            return None, None, [], evidence
        rectified = cv.warpPerspective(image, np.linalg.inv(matrix), self.size, borderValue=255)
        scores = []
        for x, y, patch in self.patches:
            pad = 14
            roi = rectified[y-pad:y+patch.shape[0]+pad, x-pad:x+patch.shape[1]+pad]
            if min(roi.shape) >= min(patch.shape) and all(a >= b for a, b in zip(roi.shape, patch.shape)):
                scores.append(float(cv.matchTemplate(roi, patch, cv.TM_CCOEFF_NORMED).max()))
        evidence['printedPatches'] = len(scores)
        evidence['weakPrintedPatches'] = sum(score < .48 for score in scores)
        if len(scores) < 3 or evidence['weakPrintedPatches'] > max(1, .18*len(scores)):
            return None, matrix, [], {**evidence, 'reason': 'printed-layout-appearance'}

        all_radii = np.concatenate(self.radii)
        observed = rings(rectified, (.56*min(all_radii), 1.45*max(all_radii)))
        transforms, details = [], []
        all_points = np.concatenate(self.points)
        for block, points, radii in zip(self.blocks, self.points, self.radii):
            offsets = np.cumsum([0]+[len(item['choices']) for item in block['items']])
            held = np.zeros(len(points), dtype=bool)
            for row, item in enumerate(block['items']):
                for col in range(len(item['choices'])):
                    held[offsets[row]+col] = (row+col) % 3 == 0
            unique = np.linalg.norm(points[:, None]-all_points[None, :], axis=2)
            pitch = np.min(np.where(unique > .01, unique, np.inf), axis=1)
            search = np.minimum(2.1*radii, .40*pitch)
            # Assign separately on fit and hold-out sets after fitting. The
            # checker also enforces exclusive observations across both groups.
            initial = nearest(points[~held], observed, search[~held])
            correction = np.zeros(2)
            if refine and len(initial) >= 3:
                correction = np.median([observed[j]-points[~held][i] for i, j in initial.items()], axis=0)
            predicted = points + correction
            matches = nearest(predicted, observed, .57*radii)
            held_indices = np.flatnonzero(held)
            held_errors = [float(np.linalg.norm(predicted[i]-observed[matches[i]])/radii[i])
                           for i in held_indices if i in matches]
            row_matches = [sum(i in matches for i in range(a, b)) for a, b in zip(offsets, offsets[1:])]
            columns = [sum(a+col in matches for a, b in zip(offsets, offsets[1:]) if col < b-a)
                       for col in range(max(np.diff(offsets)))]
            allowed = len(matches) >= .80*len(points) and len(held_errors) >= .75*sum(held) and all(
                count >= .67*(b-a) for count, a, b in zip(row_matches, offsets, offsets[1:])) and all(
                count >= .67*sum(col < b-a for a, b in zip(offsets, offsets[1:])) for col, count in enumerate(columns))
            # Search the interior of the enrolled block for unmatched printed
            # rings in an enrolled column, including added or shifted rows.
            low, high = predicted.min(axis=0), predicted.max(axis=0)
            unmatched = [p for j, p in enumerate(observed) if j not in matches.values()
                         and low[0]-radii[0] < p[0] < high[0]+radii[0]
                         and low[1]-radii[0] < p[1] < high[1]+radii[0]
                         and np.min(np.abs(predicted[:, 0]-p[0])) < .65*radii[0]
                         and np.min(np.linalg.norm(predicted-p, axis=1)) > .70*radii[0]]
            allowed = allowed and len(unmatched) < 2
            details.append({'id': block['id'], 'correction': correction.tolist(), 'matched': len(matches),
                            'total': len(points), 'heldOut': held_indices.tolist(), 'heldOutErrors': held_errors,
                            'extraOutlines': len(unmatched), 'verified': bool(allowed),
                            'observed': {str(i): observed[j].tolist() for i, j in matches.items()}})
            move = np.eye(3)
            move[:2, 2] = correction
            transforms.append(matrix @ move @ np.diag([SCALE, SCALE, 1]))
        if not all(block['verified'] for block in details):
            return None, matrix, details, {**evidence, 'reason': 'block-verification'}
        return transforms, matrix, details, evidence
