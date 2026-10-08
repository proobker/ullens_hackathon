# Asset licences

## Face candidate matcher

- Package: `@vladmandic/face-api` 1.7.15 (MIT), bundled TensorFlow.js runtime.
- Models copied from the package's `model/` directory into `apps/web/public/models/` and served locally (no CDN):

| File | SHA-256 |
| --- | --- |
| tiny_face_detector_model.bin | b7503ce7df31039b1c43316a9b865cab6a70dd748cc602d3fa28b551503c3871 |
| tiny_face_detector_model-weights_manifest.json | 5d1af4849ac48d5b985f4a9b16010c512353ddd6fcc63d50fd0bc9e9e64296e5 |
| face_landmark_68_model.bin | 4611ef65c87d836d03d684b30eec4d195d8b219fa1dd58fc58945831c6b9299b |
| face_landmark_68_model-weights_manifest.json | ca4886639f86e99b39fed0c155f81b63317225773bd9616716e887b0153389c9 |
| face_recognition_model.bin | b413e420d6840b2775fba32008db6f3cddb07d485967fb42cfcf379c16a8c589 |
| face_recognition_model-weights_manifest.json | cbaffa501b0b9275a12b63357a6843e7e30c054e1c9151e1a5f879b26e32986b |

Candidate generation only: no liveness, anti-spoofing, population accuracy or demographic performance is claimed.

## Handwriting / text OCR

- Packages: `tesseract.js` 7.0.0 and `tesseract.js-core` 7.0.0 (Apache-2.0); `@tesseract.js-data/eng` 1.0.0 (`4.0.0_best_int` English LSTM model, Apache-2.0).
- Copied into `apps/web/public/tesseract/` and served locally (no CDN). OCR runs in the browser; results are candidates confirmed line by line by a clinician.

| File | SHA-256 |
| --- | --- |
| worker.min.js | 576b7df7e3393e137e51849357c9adb53fe7ac1bb69bfa06cf3d61520f182c6d |
| tesseract-core-lstm.wasm.js | eef5f8b2f8e20e150680b20adaec4a60babafee3adbe8a94583c81fee46e8680 |
| tesseract-core-simd-lstm.wasm.js | c58b46a4c796c0b8afccf77591d5b875b6896b45d402bbce8caa6f5362447b38 |
| tesseract-core-relaxedsimd-lstm.wasm.js | 861a536cf9ef8e63cb644d57bab39c388f37f7d6b6f60024b741c5f6b39a59b3 |
| lang/eng.traineddata.gz | 45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91 |

Accuracy on real handwriting is limited (block capitals work best; cursive often fails). No accuracy claim is made.

## Handwriting model (downloaded, not bundled)

- Package: `@huggingface/transformers` 4.x (Apache-2.0), running in a browser Web Worker.
- Model: `Xenova/trocr-small-handwritten`, 8-bit quantised (about 64 MB). Not stored in this repository: the browser downloads it from the Hugging Face Hub on first use and caches it. It is the only OCR asset fetched from outside the app; images are processed locally and are never uploaded for recognition.
- Check the model card on the Hugging Face Hub for its licence before redistributing the weights.
