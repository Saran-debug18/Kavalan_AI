export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { callClaudeVision } from "@/lib/ai-engine";
import { isLocalOcrAvailable, transcribeImageLocally } from "@/lib/ocr-local";

const MAX_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(request: NextRequest) {
	try {
		const form = await request.formData();
		const file = form.get("image");
		if (!(file instanceof File))
			return NextResponse.json(
				{ error: "image field is required (multipart/form-data)" },
				{ status: 400 },
			);
		if (!ALLOWED.has(file.type))
			return NextResponse.json(
				{
					error: `Unsupported image type ${file.type}. Allowed: ${Array.from(ALLOWED).join(", ")}`,
				},
				{ status: 415 },
			);
		if (file.size > MAX_BYTES)
			return NextResponse.json(
				{
					error: `Image too large (${Math.round(file.size / 1024)} KB, max 8 MB)`,
				},
				{ status: 413 },
			);

		const bytes = new Uint8Array(await file.arrayBuffer());
		const buffer = Buffer.from(bytes);

		// Try the locally fine-tuned TrOCR model first (no external API call, no
		// cost). It was trained on isolated handwritten words, so it may not
		// handle full multi-line report pages well — fall back to the Groq vision
		// call if it's unavailable or produces nothing usable.
		if (isLocalOcrAvailable()) {
			try {
				const localText = await transcribeImageLocally(buffer, file.type);
				if (localText && localText.length > 0) {
					return NextResponse.json({
						text: localText,
						bytes: file.size,
						mimeType: file.type,
						source: "local-trocr",
					});
				}
			} catch (err) {
				console.warn(
					"Local OCR failed, falling back to Groq vision:",
					(err as Error).message,
				);
			}
		}

		const base64 = buffer.toString("base64");

		const systemPrompt = `You are a forensic document transcription assistant.
You receive photographs or scans of autopsy report pages and transcribe the content
verbatim. Do not summarize, interpret, or add commentary. Preserve section headings,
numbered injury lists, paragraph breaks, measurements, anatomical terms, and any
toxicology tables as they appear in the source. If a region is partially illegible,
write [illegible] and continue. Output only the transcribed text as plain text —
no JSON, no markdown, no preamble, no notes.`;

		const userPrompt = `Transcribe this autopsy report page verbatim.
Preserve the structure:
- Section headings (CIRCUMSTANCES, EXTERNAL EXAMINATION, INJURIES, TOXICOLOGY, OPINION, etc.)
- Numbered or bulleted lists of injuries with anatomical locations and measurements
- Body temperature, rigor stage, livor findings exactly as written
- Cause of death and manner of death statements
- Any signature block or prosector identification if visible

Output the transcription as plain text only.`;

		const text = await callClaudeVision(
			systemPrompt,
			userPrompt,
			[{ mediaType: file.type, base64 }],
			2048,
			"autopsy_image_transcription",
		);

		const cleaned = (text ?? "").trim();
		if (!cleaned)
			return NextResponse.json(
				{
					error:
						"No text could be extracted from the image. Check image clarity and resolution.",
				},
				{ status: 422 },
			);

		return NextResponse.json({
			text: cleaned,
			bytes: file.size,
			mimeType: file.type,
			source: "groq",
		});
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
