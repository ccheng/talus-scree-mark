"""An independent form-identity gate for the offline experiment."""
import cv2 as cv
import numpy as np

from match import SCALE, gray


class FormIdentity:
    def __init__(self, reference, config):
        self.config = config
        if not config:
            return
        if config['mode'] == 'manual':
            if not isinstance(config.get('version'), str) or not config['version'].strip():
                raise ValueError('Manual identity needs an explicit enrolled version.')
            return
        if config['mode'] != 'printed':
            raise ValueError('Unsupported form identity mode.')
        bounds = config['bounds']
        x, y, width, height = [round(SCALE*bounds[k]) for k in ('x', 'y', 'width', 'height')]
        if width < 14 or height < 14 or x < 0 or y < 0 or x+width > reference.width or y+height > reference.height:
            raise ValueError('Printed identity needs a readable region inside the blank page.')
        self.bounds = (x, y, width, height)
        self.size = reference.size
        self.patch = reference.image[y:y+height, x:x+width]
        if not self.readable(self.patch) or not np.all(reference.mask[y:y+height, x:x+width]):
            raise ValueError('Identity region must contain distinctive print outside the answer bubbles.')

    @staticmethod
    def readable(patch):
        low, high = np.percentile(patch, [5, 85])
        return high-low >= 50 and np.mean(patch < (high+low)/2) >= .07

    def verify(self, image, matrix, confirmed):
        if not self.config:
            return {'status': 'not-configured'}  # Historical, read-only benchmark fixtures.
        if self.config['mode'] == 'manual':
            status = 'unconfirmed' if not confirmed else (
                'manual-confirmed' if confirmed == self.config['version'] else 'mismatch-or-unreadable')
            return {'status': status}
        x, y, width, height = self.bounds
        pad = 24
        left, top = max(0, x-pad), max(0, y-pad)
        w = min(self.size[0], x+width+pad)-left
        h = min(self.size[1], y+height+pad)-top
        crop = np.array([[1.,0.,-left],[0.,1.,-top],[0.,0.,1.]])
        scan = gray(image)
        transform = crop@np.linalg.inv(matrix)
        window = cv.warpPerspective(scan, transform, (w,h), borderValue=255)
        coverage = cv.warpPerspective(np.full(scan.shape, 255, dtype=np.uint8), transform, (w,h))
        scores = cv.matchTemplate(window, self.patch, cv.TM_CCOEFF_NORMED)
        _, score, _, (column,row) = cv.minMaxLoc(scores)
        observed = window[row:row+height, column:column+width]
        in_frame = np.all(coverage[row:row+height, column:column+width] == 255)
        accepted = in_frame and self.readable(observed) and score >= .88
        return {'status': 'verified' if accepted else 'mismatch-or-unreadable', 'score': round(score, 3)}
