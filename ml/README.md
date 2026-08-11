# KAVALAN — Local ML Models (OCR + Detection)

This folder holds training assets for two models that will eventually replace/augment
the Groq vision API calls in the app with locally-run models:

| Track | Goal | Replaces | Dataset | Status |
|---|---|---|---|---|
| **OCR** | Fine-tune TrOCR on handwritten/scanned text | `src/app/api/analyze/autopsy/extract-image/route.ts` (autopsy report transcription) | [Handwriting Recognition](https://www.kaggle.com/datasets/landlord/handwriting-recognition) (330K+ handwritten words) | ✅ Trained, exported, wired in |
| **Detection** | Fine-tune YOLOv8 to detect guns/knives in evidence photos | New capability — structured detections instead of free-text extraction in `src/app/api/cases/[id]/digital/extract-image/route.ts` | [Guns-Knives Object Detection](https://www.kaggle.com/datasets/iqmansingh/guns-knives-object-detection) | Not started |

### OCR track — important limitation

The trained model was fine-tuned on **isolated single handwritten words**, not full
multi-line document pages — that's what the training dataset actually contains. It
transcribes individual words very well (5/5 correct on held-out sanity checks after
training), but a photo of a full autopsy report page is a materially harder problem
(line/paragraph segmentation, layout) that this model was never trained on. Treat the
current integration as a v1: it's wired in and running, but real-world transcription
quality on full report pages needs to be evaluated before relying on it — a stronger
follow-up would fine-tune on line- or paragraph-level data, or add a word-segmentation
step in front of this model.

## Why training happens on Kaggle, not this machine

This machine only has an integrated Intel HD Graphics 4600 GPU — no CUDA, no practical
deep-learning training capability. Both notebooks are written to run **as Kaggle
Notebooks**, using Kaggle's free GPU quota (T4/P100), with the datasets attached
directly (no download step needed on Kaggle's side).

## How to run each notebook

1. Go to kaggle.com → **Create → New Notebook**.
2. In the notebook, click **File → Import Notebook** and upload the `.ipynb` file from
   this folder (or copy/paste the cells manually).
3. In the right sidebar, click **Add Input** and attach the dataset listed in the table
   above (search by name, click "Add").
4. In the right sidebar, under **Settings → Accelerator**, select **GPU T4 x2** (or
   whatever GPU option is available on your account).
5. **Run All**. Training is capped at a small number of epochs by default so it fits
   comfortably in Kaggle's free session time — bump `EPOCHS` up once you've confirmed
   the pipeline works end to end.
6. At the end of each notebook, the model is exported to **ONNX** and written to
   `/kaggle/working/`. Use the notebook's **Output** tab (or "Download" button) to pull
   the `.onnx` file down to this machine.

## Dataset structure caveat

I haven't inspected either dataset's files directly (they require your Kaggle
credentials to download). Both notebooks include a **cell 2 "inspect the dataset"**
step that lists what Kaggle actually mounted at `/kaggle/input/...` before assuming any
file layout — run that cell first and adjust the paths in the following cell if the
printed structure doesn't match the comments. Kaggle dataset layouts vary by uploader
even when they're nominally "the same kind" of dataset.

## Bringing a trained model back into the app

Once you have exported `.onnx` files on this machine:

1. Drop them in `ml/models/<model-name>/` — **note the expected layout**:
   `config.json`, `tokenizer.json`, `preprocessor_config.json`, etc. go directly in that
   folder; the `.onnx` weight files go in an `onnx/` subfolder underneath it (this is the
   convention [`@huggingface/transformers`](https://www.npmjs.com/package/@huggingface/transformers)
   expects). See `ml/models/trocr-onnx/` for a working example.
2. Inference runs **in-process in the existing Next.js API routes** via
   `@huggingface/transformers` (a JS/ONNX runtime — no separate Python service). See
   `src/lib/ocr-local.ts` for the OCR wrapper.
3. `next.config.mjs` externalizes `@huggingface/transformers`, `onnxruntime-node`, and
   `sharp` from the webpack server bundle — required, since these ship native bindings /
   WASM assets that webpack can't bundle correctly. Any new local-model integration needs
   the same treatment.
4. `ml/test-ocr.mjs` is a standalone Node script (not through Next.js) for sanity-checking
   a model loads and runs inference correctly, independent of the app — useful when
   debugging a new export before wiring it into a route.

## Status

### OCR (TrOCR)
- [x] Dataset identified, training notebook written
- [x] Trained on Kaggle (3 epochs, 20K samples, ~2.8hr on T4 — see notebook for details)
- [x] Exported to ONNX, downloaded to `ml/models/trocr-onnx/`
- [x] Wired into `/api/analyze/autopsy/extract-image` via `src/lib/ocr-local.ts`, with
      fallback to the Groq vision call if the local model files aren't present
- [ ] Real-world accuracy on full report-page photos not yet evaluated (see limitation
      note above — trained on single words, not full pages)

### Detection (YOLOv8 weapons)
- [x] Dataset identified, training notebook written
- [ ] Not yet trained on Kaggle
- [ ] Not yet wired into the app
