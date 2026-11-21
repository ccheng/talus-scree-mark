# Recognition research and benchmark proposal

This is a literature and tooling review. M0 ran no recognition benchmark or physical-device experiment.

## Bubble reading

Start with controlled, versioned paper layouts and four distinguishable registration anchors so perspective correction and orientation can be checked independently. Use a four-point homography for the anchored baseline and reject doubtful alignment before sampling dense grids. Evaluate anchor-free registration on existing mock forms using blank-sheet import or manual calibration. For automatic discovery, evaluate component identity, geometry and cell grouping on unregistered layouts separately from decoding. Compare normalized interior darkness against a local background or ring around the bubble. Record per-cell scores and compare the high score with the runner-up. Classify blanks, faint/erased marks, multiple marks and damaged regions with explicit review reasons. Compare contrast and adaptive-threshold approaches on calibration images. Evaluate lightweight native JavaScript first and add OpenCV.js if measured reliability or maintainability justifies its payload.

Alberta's examples use four positions with decimal bubbles in interior columns where supported. Some science formats handle signs outside the number field. The layout should declare each cell's legal symbols, handwritten region and sign convention. Preserve exact responses and positional blanks. The grading policy separately decides allowable representations, alternate correct answers or tolerance.

- [OpenCV geometric transformations](https://docs.opencv.org/4.x/da/d54/group__imgproc__transform.html)
- [OpenCV thresholding](https://docs.opencv.org/4.x/d7/d4d/tutorial_py_thresholding.html)
- [OpenCV licensing](https://opencv.org/license/)
- [Alberta science numerical-response examples](https://www.alberta.ca/system/files/custom_downloaded_images/edc-diploma-exam-sciences-audio-descriptions-examples.pdf)
- [Alberta Science 30 student guide](https://www.alberta.ca/system/files/custom_downloaded_images/ed-diploma-exam-science-30-guide.pdf)

## Handwriting

| Option | Proposed role | Limits to measure |
| --- | --- | --- |
| ONNX Runtime Web, MIT, CPU WASM | Preferred first trial. Documented iOS Safari WASM support. Start with a single thread and same-origin pinned JS/WASM assets. | Runtime size, iPhone startup and inference latency, memory and offline cache behavior. |
| TensorFlow.js WASM, Apache-2.0 | Alternative if a Keras-based candidate warrants another runtime. Host WASM and model files on the app origin. | Compare complete transfer size and performance on the same crops and phones. Check model license independently. |
| MNIST-8 CNN, Apache-2.0 model card | Float32 baseline of roughly 26.5 kB. Verify input and use one normalized 28 × 28 digit crop per inference. | The model card's 1.1% MNIST error measures isolated dataset digits. Phone crops, writing styles, blanks, decimals and physical artifacts require new tests. |
| MNIST-12-int8, Apache-2.0 model card | Approximately 11 kB weight comparison. | Check quantized operator support, accuracy and latency under the selected WASM runtime. The runtime may dominate total size. |

Detect blank, decimal and stray ink separately before estimating a digit. Report crop and segmentation failures. Flag disagreements between handwriting and bubbles, preserving both readings. A missing or unsuccessful CNN remains an optional-channel outcome while bubble OMR continues. Verify exact model artifact hash, runtime version, licensing and redistribution notices before bundling.

- [ONNX Runtime Web browser support](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)
- [ONNX Runtime Web configuration](https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html)
- [ONNX Runtime license](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)
- [TensorFlow.js backends](https://www.tensorflow.org/js/guide/platform_environment)
- [TensorFlow.js license](https://github.com/tensorflow/tfjs/blob/master/LICENSE)
- [MNIST-8 model card](https://huggingface.co/onnxmodelzoo/mnist-8)
- [MNIST-12-int8 model card](https://huggingface.co/onnxmodelzoo/mnist-12-int8)

## Evaluation

| Stage | Measurements |
| --- | --- |
| Layout and alignment | Exact profile and orientation, unsupported-profile rejection, corner reprojection error and region displacement normalized to bubble geometry. |
| OMR | Per-bubble precision and recall, status confusion and exact MC and four-cell NR response. Evaluate oracle regions and automatic regions separately. |
| Handwriting | Isolated-digit accuracy and confusion matrix, blank and decimal handling, exact four-cell token, oracle versus automatic crops and mismatch routing. |
| Full pipeline | Exact response, whole-sheet and grade agreement, review burden, retake/rejection and failure rates, and cold/warm p50/p95 by stage. |

Preregister standard and stress strata. Report counts and denominators by layout, device and capture condition. Automatic coverage is auto-accepted responses divided by all in-scope responses. Silent error is wrong auto-accepted responses divided by auto-accepted responses. Also report wrong auto-accepted responses divided by all in-scope responses and the review or retake burden. Show how thresholds trade off coverage and error and quantify uncertainty by resampling physical sheets or writers where feasible. Report independent cluster counts alongside sheet, image, writer and response counts as applicable, and identify any repeated observations. Report the uncertainty method, small counts and wide intervals explicitly. If the holdout has too few independent clusters for a defensible estimate, mark uncertainty as unresolved. Zero observed silent errors is a sample result with uncertainty. Record software/hardware, browser mode, image size and failed attempts alongside timings.

Create an open development split and a calibration split for threshold selection. The Evaluator controls a sealed holdout outside the repository. Prevent leakage across template families where testing new-family transfer, and across writers, physical sheets and capture sessions. Group all transformations and recaptures with their original. Test known profiles on fresh captures, newly registered families with frozen settings, and a separate set of unsupported or damaged layouts. Freeze the commit, model/runtime hashes, profiles, thresholds and oracle before opening the holdout. Annotate ambiguous cases independently and adjudicate before scoring. Publish sanitized aggregate results and use a fresh reserve split after tuning to fix an exposed case.

Use synthetic inputs for routine tests and purpose-built mock sheets marked by approved adult volunteers for phone studies. For the final classroom workflow pilot, use approximately 30–40 distinct mock answer sheets, with seven as an optional earlier smoke test. For a recognition study, set the number of independent sheets and writers, layout families and device/session mix according to the required precision. Repeated photos and perturbations add observations within a cluster. Report workflow evidence and recognition evidence separately.

- [Selective classification and risk–coverage curves](https://papers.neurips.cc/paper_files/paper/2017/hash/4a8423d5e91fda00bb7e46540e2b0cf1-Abstract.html)
