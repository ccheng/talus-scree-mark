"""Generate synthetic normalized glyphs for HOG port smoke testing."""
import json,numpy as np
from train_svm import data
from nr_reference import features
X,_=data(2,200,170213)
with open('hog-fixtures.json','w') as f:json.dump(dict(images=np.uint8(X*255).reshape(-1,576).tolist(),descriptors=features(X).tolist()),f,separators=(',',':'))
