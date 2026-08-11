export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callClaudeVision } from "@/lib/ai-engine";
import { triggerTimelineRegeneration } from "@/lib/timeline-service";
import { randomUUID } from "crypto";
import type { DigitalEvidence, DigitalSourceType } from "@/types";

const VALID_SOURCES: DigitalSourceType[] = [
	"CCTV",
	"MOBILE",
	"FINANCIAL",
	"SOCIAL",
	"GPS",
	"EMAIL",
	"BROWSER",
];

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
	"image/gif",
]);

interface ClaudeEvent {
	sourceType?: string;
	sourceName?: string;
	timestamp?: string;
	location?: string;
	subject?: string;
	description?: string;
	confidence?: number;
	anomalyScore?: number;
	tags?: string[];
}

function normalise(
	rec: ClaudeEvent,
	caseId: string,
	fallbackSourceName: string,
): DigitalEvidence | null {
	const sourceType = String(rec.sourceType ?? "")
		.toUpperCase()
		.trim() as DigitalSourceType;
	if (!VALID_SOURCES.includes(sourceType)) return null;

	const sourceName =
		String(rec.sourceName ?? "").trim() || fallbackSourceName;

	const timestamp = String(rec.timestamp ?? "").trim();
	if (!timestamp) return null;

	let confidence = Number(rec.confidence ?? 0.6);
	if (Number.isNaN(confidence)) confidence = 0.6;
	if (confidence > 1) confidence = confidence / 100;
	confidence = Math.max(0, Math.min(1, confidence));

	let anomalyScore = Number(rec.anomalyScore ?? 0);
	if (Number.isNaN(anomalyScore)) anomalyScore = 0;
	anomalyScore = Math.max(0, Math.min(100, anomalyScore));

	const tags = Array.isArray(rec.tags) ? rec.tags : [];
	tags.push("image-extracted");

	return {
		id: `dig-${randomUUID().slice(0, 8)}`,
		caseId,
		sourceType,
		sourceName,
		timestamp,
		location: String(rec.location ?? "").trim(),
		subject: String(rec.subject ?? "").trim(),
		description: String(rec.description ?? "").trim(),
		confidence,
		anomalyScore,
		tags: JSON.stringify(tags),
	};
}

export async function POST(
	request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const { id } = params;
		if (!db.prepare("SELECT id FROM cases WHERE id = ?").get(id))
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const form = await request.formData();
		const file = form.get("image");
		const hint = (form.get("hint") as string | null) ?? "";

		if (!(file instanceof File))
			return NextResponse.json(
				{ error: "image file is required (multipart/form-data field 'image')" },
				{ status: 400 },
			);

		if (!ALLOWED_MIME.has(file.type))
			return NextResponse.json(
				{
					error: `Unsupported image type ${file.type}. Allowed: ${Array.from(
						ALLOWED_MIME,
					).join(", ")}`,
				},
				{ status: 415 },
			);

		if (file.size > MAX_IMAGE_BYTES)
			return NextResponse.json(
				{ error: `Image too large (${Math.round(file.size / 1024)} KB, max 5 MB)` },
				{ status: 413 },
			);

		const bytes = new Uint8Array(await file.arrayBuffer());
		const base64 = Buffer.from(bytes).toString("base64");
		const fallbackSourceName = file.name || "Uploaded Image";

		const systemPrompt = `You are a forensic digital evidence analyst for the KAVALAN system.
You extract structured investigative events from a single image (e.g. CCTV still, phone screenshot,
receipt, map, financial statement, social-media post). You never invent details. When a field
cannot be determined from the image, omit it or set "" (empty string). Respond with VALID JSON only.`;

		const userMessage = `Extract all distinct digital-evidence events visible in this image.
Return a JSON object of the shape:
{
  "events": [
    {
      "sourceType": "CCTV" | "MOBILE" | "FINANCIAL" | "SOCIAL" | "GPS" | "EMAIL" | "BROWSER",
      "sourceName": string (short label identifying the source, e.g. "Pier 17 Cam-08"),
      "timestamp": string (ISO 8601, UTC if possible; if only time is visible, best-effort),
      "location": string,
      "subject": string (person, vehicle, account, device the event concerns),
      "description": string (what the event is),
      "confidence": number 0-1 (how confident the extraction is),
      "anomalyScore": number 0-100 (how suspicious this looks),
      "tags": string[]
    }
  ],
  "summary": string (1-2 sentence summary of what the image shows)
}

RULES:
- sourceType MUST be one of the seven values above, uppercase.
- If you cannot determine a plausible timestamp, set timestamp to "" and lower confidence.
- If no recognizable digital evidence is visible, return { "events": [], "summary": "<reason>" }.
- Do not hallucinate subjects or locations.

Optional investigator hint: ${hint || "(none)"}

Respond with JSON only.`;

		let parsed: { events?: ClaudeEvent[]; summary?: string };
		try {
			const raw = await callClaudeVision(
				systemPrompt,
				userMessage,
				[{ mediaType: file.type, base64 }],
				1500,
				"image_evidence_extraction",
			);
			const cleaned = raw
				.replace(/^```(?:json)?\n?/i, "")
				.replace(/\n?```$/i, "")
				.trim();
			parsed = JSON.parse(cleaned);
		} catch (err) {
			return NextResponse.json(
				{
					error: `Vision extraction failed: ${
						err instanceof Error ? err.message : String(err)
					}`,
				},
				{ status: 502 },
			);
		}

		const rawEvents = parsed.events ?? [];
		const valid: DigitalEvidence[] = [];
		const rejected: { index: number; reason: string; raw: ClaudeEvent }[] = [];
		rawEvents.forEach((r, idx) => {
			const rec = normalise(r, id, fallbackSourceName);
			if (rec) valid.push(rec);
			else
				rejected.push({
					index: idx,
					reason:
						"Missing sourceType/timestamp or invalid sourceType. Valid: " +
						VALID_SOURCES.join(", "),
					raw: r,
				});
		});

		if (valid.length === 0)
			return NextResponse.json(
				{
					extracted: 0,
					inserted: 0,
					rejected,
					summary: parsed.summary ?? "No extractable events found in image.",
				},
				{ status: 200 },
			);

		const stmt = db.prepare(`
      INSERT INTO digital_evidence
        (id,caseId,sourceType,sourceName,timestamp,location,subject,description,confidence,anomalyScore,tags)
      VALUES
        ($id,$caseId,$sourceType,$sourceName,$timestamp,$location,$subject,$description,$confidence,$anomalyScore,$tags)
    `);

		const activity = db.prepare(`
      INSERT INTO case_activities (id,caseId,type,description,createdAt,agent)
      VALUES ($id,$caseId,$type,$description,$createdAt,$agent)
    `);

		const tx = db.transaction(() => {
			for (const r of valid) stmt.run(r);
			activity.run({
				id: `act-${randomUUID().slice(0, 8)}`,
				caseId: id,
				type: "EVIDENCE_ADDED",
				description: `Vision extracted ${valid.length} digital record${valid.length === 1 ? "" : "s"} from image "${fallbackSourceName}".`,
				createdAt: new Date().toISOString(),
				agent: "KAVALAN Vision",
			});
		});
		tx();

		triggerTimelineRegeneration(id);

		return NextResponse.json(
			{
				extracted: rawEvents.length,
				inserted: valid.length,
				rejected,
				records: valid,
				summary: parsed.summary ?? "",
			},
			{ status: 201 },
		);
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
