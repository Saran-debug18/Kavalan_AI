# KAVALAN — Local ML Models (OCR + Detection)

This folder holds training assets for two models that will eventually replace/augment
the Groq vision API calls in the app with locally-run models:

| Track | Goal | Replaces | Dataset |
|---|---|---|---|
| **OCR** | Fine-tune TrOCR on handwritten/scanned text | `src/app/api/analyze/autopsy/extract-image/route.ts` (autopsy report transcription) | [Handwritten OCR image data in English](https://www.kaggle.com/datasets/appenlimited/handwritten-ocr-image-data-in-english) |
| **Detection** | Fine-tune YOLOv8 to detect guns/knives in evidence photos | New capability — structured detections instead of free-text extraction in `src/app/api/cases/[id]/digital/extract-image/route.ts` | [Guns-Knives Object Detection](https://www.kaggle.com/datasets/iqmansingh/guns-knives-object-detection) |

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

## Bringing the trained model back into the app

Once you have `ocr-trocr.onnx` and `weapon-detect-yolov8.onnx` on this machine:

1. Drop them in `ml/models/` (gitignored — these files are large).
2. Next step (not done yet, pending trained weights) is a small inference layer using
   [`onnxruntime-node`](https://www.npmjs.com/package/onnxruntime-node) so the models run
   **in-process in the existing Next.js API routes** — no separate Python service needed.
   I'll wire `/api/analyze/autopsy/extract-image` and
   `/api/cases/[id]/digital/extract-image` to try the local ONNX model first and fall
   back to the Groq vision call if the model file isn't present, so nothing breaks in the
   meantime.

## Status

- [x] Datasets identified
- [x] Training notebooks written (`notebooks/ocr_trocr_finetune.ipynb`, `notebooks/weapon_detection_yolov8.ipynb`)
- [ ] Notebooks run on Kaggle (blocked on you running them — needs your Kaggle account)
- [ ] `.onnx` weights brought back to this machine
- [ ] `onnxruntime-node` inference layer wired into the API routes
