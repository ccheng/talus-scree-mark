import unittest
from types import SimpleNamespace

import cv2 as cv
import numpy as np

from identity import FormIdentity


def printed(label):
    page = np.full((160, 180), 246, np.uint8)
    cv.putText(page, label, (42, 82), cv.FONT_HERSHEY_SIMPLEX, 1.6, 25, 3, cv.LINE_AA)
    return page


class IdentityTests(unittest.TestCase):
    def test_short_code_and_unreadable_identity(self):
        page = printed('K')
        reference = SimpleNamespace(image=page, width=180, height=160, size=(180, 160),
                                    mask=np.full_like(page, 255))
        gate = FormIdentity(reference, {'mode': 'printed', 'bounds': dict(x=19, y=21, width=22, height=23)})
        for label, expected in [('K', 'verified'), ('R', 'mismatch-or-unreadable'), ('', 'mismatch-or-unreadable')]:
            with self.subTest(label=label):
                image = cv.cvtColor(printed(label), cv.COLOR_GRAY2BGR)
                self.assertEqual(gate.verify(image, np.eye(3), 'K')['status'], expected)

    def test_identical_print_requires_per_scan_confirmation(self):
        gate = FormIdentity(None, {'mode': 'manual', 'version': 'Physics A'})
        for selected, status in [(None, 'unconfirmed'), ('Physics B', 'mismatch-or-unreadable'),
                                 ('Physics A', 'manual-confirmed'), (None, 'unconfirmed')]:
            self.assertEqual(gate.verify(None, None, selected)['status'], status)


if __name__ == '__main__':
    unittest.main()
