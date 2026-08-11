export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { getSessionAgentName } from "@/lib/auth";
import { triggerTimelineRegeneration } from "@/lib/timeline-service";
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

interface RawRecord {
	sourceType?: string;
	sourceName?: string;
	timestamp?: string;
	location?: string;
	subject?: string;
	description?: string;
	confidence?: number | string;
	anomalyScore?: number | string;
	tags?: string | string[];
}

function normalise(rec: RawRecord, caseId: string): DigitalEvidence | null {
	if (!rec || typeof rec !== "object") return null;

	const sourceType = String(rec.sourceType ?? "")
		.toUpperCase()
		.trim() as DigitalSourceType;
	if (!VALID_SOURCES.includes(sourceType)) return null;

	const sourceName = String(rec.sourceName ?? "").trim();
	const timestamp = String(rec.timestamp ?? "").trim();
	if (!sourceName || !timestamp) return null;

	const description = String(rec.description ?? "").trim();
	const subject = String(rec.subject ?? "").trim();
	const location = String(rec.location ?? "").trim();

	let confidence = Number(rec.confidence ?? 0.5);
	if (Number.isNaN(confidence)) confidence = 0.5;
	confidence = Math.max(0, Math.min(1, confidence));

	let anomalyScore = Number(rec.anomalyScore ?? 0);
	if (Number.isNaN(anomalyScore)) anomalyScore = 0;
	anomalyScore = Math.max(0, Math.min(100, anomalyScore));

	let tags: string;
	if (Array.isArray(rec.tags)) tags = JSON.stringify(rec.tags);
	else if (typeof rec.tags === "string" && rec.tags.startsWith("[")) tags = rec.tags;
	else if (typeof rec.tags === "string" && rec.tags.trim())
		tags = JSON.stringify(
			rec.tags
				.split(",")
				.map((t) => t.trim())
				.filter(Boolean),
		);
	else tags = "[]";

	return {
		id: `dig-${randomUUID().slice(0, 8)}`,
		caseId,
		sourceType,
		sourceName,
		timestamp,
		location,
		subject,
		description,
		confidence,
		anomalyScore,
		tags,
	};
}

function parseCsv(csv: string): RawRecord[] {
	// Very small CSV parser: supports comma separator, quoted fields with escapes ("").
	const rows: string[][] = [];
	let field = "";
	let row: string[] = [];
	let inQuotes = false;
	for (let i = 0; i < csv.length; i++) {
		const c = csv[i];
		if (inQuotes) {
			if (c === '"' && csv[i + 1] === '"') {
				field += '"';
				i++;
			} else if (c === '"') {
				inQuotes = false;
			} else {
				field += c;
			}
		} else if (c === '"') {
			inQuotes = true;
		} else if (c === ",") {
			row.push(field);
			field = "";
		} else if (c === "\n" || c === "\r") {
			if (c === "\r" && csv[i + 1] === "\n") i++;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += c;
		}
	}
	if (field.length > 0 || row.length > 0) {
		row.push(field);
		rows.push(row);
	}
	if (rows.length === 0) return [];

	const header = rows[0].map((h) => h.trim());
	return rows.slice(1).flatMap((cols) => {
		if (cols.every((c) => c.trim() === "")) return [];
		const obj: Record<string, string> = {};
		header.forEach((h, idx) => {
			obj[h] = (cols[idx] ?? "").trim();
		});
		return [obj as RawRecord];
	});
}

export async function GET(
	_request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const { id } = params;
		const rows = db
			.prepare(
				"SELECT * FROM digital_evidence WHERE caseId = ? ORDER BY timestamp ASC",
			)
			.all(id);
		return NextResponse.json(rows);
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}

export async function POST(
	request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const { id } = params;
		if (!db.prepare("SELECT id FROM cases WHERE id = ?").get(id))
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const body = await request.json();

		let rawRecords: RawRecord[] = [];
		if (typeof body?.csv === "string" && body.csv.trim().length > 0) {
			rawRecords = parseCsv(body.csv);
		} else if (Array.isArray(body)) {
			rawRecords = body as RawRecord[];
		} else if (Array.isArray(body?.records)) {
			rawRecords = body.records as RawRecord[];
		} else if (body && typeof body === "object") {
			rawRecords = [body as RawRecord];
		}

		if (rawRecords.length === 0)
			return NextResponse.json(
				{ error: "No records provided" },
				{ status: 400 },
			);

		const valid: DigitalEvidence[] = [];
		const rejected: { index: number; reason: string; raw: RawRecord }[] = [];
		rawRecords.forEach((r, idx) => {
			const rec = normalise(r, id);
			if (rec) valid.push(rec);
			else
				rejected.push({
					index: idx,
					reason:
						"Missing sourceType/sourceName/timestamp or invalid sourceType. Valid sourceTypes: " +
						VALID_SOURCES.join(", "),
					raw: r,
				});
		});

		if (valid.length === 0)
			return NextResponse.json(
				{ error: "No valid records", rejected },
				{ status: 400 },
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

		const agentName = await getSessionAgentName(request);
		const tx = db.transaction(() => {
			for (const r of valid) stmt.run(r);
			activity.run({
				id: `act-${randomUUID().slice(0, 8)}`,
				caseId: id,
				type: "EVIDENCE_ADDED",
				description: `${valid.length} digital evidence record${valid.length === 1 ? "" : "s"} added.`,
				createdAt: new Date().toISOString(),
				agent: agentName,
			});
		});
		tx();

		triggerTimelineRegeneration(id);

		return NextResponse.json(
			{
				inserted: valid.length,
				rejected,
				records: valid,
			},
			{ status: 201 },
		);
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
