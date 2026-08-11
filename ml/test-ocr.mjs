import { pipeline, env, RawImage } from "@huggingface/transformers";
import path from "path";
import fs from "fs";

env.allowRemoteModels = false;
env.allowLocalModels = true;
env.localModelPath = path.join(process.cwd(), "ml", "models");

console.log("Loading pipeline...");
const pipe = await pipeline("image-to-text", "trocr-onnx", {
	local_files_only: true,
});
console.log("Pipeline loaded. Memory usage:", process.memoryUsage());

const imgPath = path.join(process.cwd(), "docs", "screenshots", "01-dashboard.png");
const buf = fs.readFileSync(imgPath);

console.log("Decoding image via RawImage...");
const blob = new Blob([buf], { type: "image/png" });
const image = await RawImage.fromBlob(blob);
console.log("Image decoded:", image.width, "x", image.height);

console.log("Running inference...");
const start = Date.now();
const result = await pipe(image);
console.log(`Inference done in ${Date.now() - start}ms`);
console.log("Result:", JSON.stringify(result));
console.log("Memory after inference:", process.memoryUsage());
