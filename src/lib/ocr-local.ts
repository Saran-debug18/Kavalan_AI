import fs from "fs";
import path from "path";

const MODEL_DIR_NAME = "trocr-onnx";
const MODELS_ROOT = path.join(process.cwd(), "ml", "models");
const MODEL_PATH = path.join(MODELS_ROOT, MODEL_DIR_NAME);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipelinePromise: Promise<any> | null = null;

export function isLocalOcrAvailable(): boolean {
	return fs.existsSync(path.join(MODEL_PATH, "onnx", "encoder_model.onnx"));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getPipeline(): Promise<any> {
	if (!pipelinePromise) {
		pipelinePromise = (async () => {
			const { pipeline, env } = await import("@huggingface/transformers");
			env.allowRemoteModels = false;
			env.allowLocalModels = true;
			env.localModelPath = MODELS_ROOT;
			return pipeline("image-to-text", MODEL_DIR_NAME, {
				local_files_only: true,
			});
		})();
	}
	return pipelinePromise;
}

/**
 * Transcribes an image using the locally fine-tuned TrOCR ONNX model. Returns
 * null if the model files aren't present on disk (caller should fall back to
 * the Groq vision call in that case) — throws if the model is present but
 * inference itself fails.
 */
export async function transcribeImageLocally(
	imageBuffer: Buffer,
	mimeType = "image/png",
): Promise<string | null> {
	if (!isLocalOcrAvailable()) return null;

	const { RawImage } = await import("@huggingface/transformers");
	const pipe = await getPipeline();

	// Decode via RawImage.fromBlob rather than a data: URL — passing a data URL
	// routes through fetch() internally and fails to parse for reasons unrelated
	// to image validity; this path is direct and reliable.
	const blob = new Blob([imageBuffer as unknown as BlobPart], { type: mimeType });
	const image = await RawImage.fromBlob(blob);
	const result = await pipe(image);

	const generatedText = Array.isArray(result)
		? result[0]?.generated_text
		: result?.generated_text;

	return typeof generatedText === "string" ? generatedText.trim() : null;
}
