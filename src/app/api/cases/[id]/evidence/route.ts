export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { getSessionAgentName } from "@/lib/auth";
import fs from "fs";
import path from "path";
import type { EvidenceType } from "@/types";

const VALID_TYPES: EvidenceType[] = [
	"PHYSICAL",
	"DIGITAL",
	"BIOLOGICAL",
	"TESTIMONIAL",
	"FORENSIC",
];

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
const ALLOWED_MIME: Record<string, string> = {
	"image/png": ".png",
	"image/jpeg": ".jpg",
	"image/webp": ".webp",
	"image/gif": ".gif",
};

const IMAGE_DIR = path.join(process.cwd(), "data", "evidence_images");

export async function GET(
	_request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const { id } = params;
		const rows = db
			.prepare(
				"SELECT * FROM evidence WHERE caseId = ? ORDER BY collectedAt DESC",
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
		const { id: caseId } = params;
		if (!db.prepare("SELECT id FROM cases WHERE id = ?").get(caseId))
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const contentType = request.headers.get("content-type") ?? "";
		let body: Record<string, unknown> = {};
		let image: File | null = null;

		if (contentType.startsWith("multipart/form-data")) {
			const form = await request.formData();
			form.forEach((v, k) => {
				if (v instanceof File) return;
				body[k] = v;
			});
			const maybeImage = form.get("image");
			if (maybeImage instanceof File && maybeImage.size > 0) image = maybeImage;
		} else {
			body = await request.json();
		}

		const type = String(body.type ?? "")
			.toUpperCase()
			.trim() as EvidenceType;
		if (!VALID_TYPES.includes(type))
			return NextResponse.json(
				{
					error: `type is required and must be one of: ${VALID_TYPES.join(", ")}`,
				},
				{ status: 400 },
			);

		const description = String(body.description ?? "").trim();
		if (!description)
			return NextResponse.json(
				{ error: "description is required" },
				{ status: 400 },
			);

		const analyst = String(body.analyst ?? "Investigator").trim();
		const location = String(body.location ?? "").trim();
		const notes = String(body.notes ?? "").trim();
		let confidence = parseFloat(String(body.confidence ?? "0.8"));
		if (!Number.isFinite(confidence)) confidence = 0.8;
		if (confidence > 1) confidence = confidence / 100;
		confidence = Math.max(0, Math.min(1, confidence));

		const collectedAtRaw = String(body.collectedAt ?? "").trim();
		const collectedAt = collectedAtRaw
			? new Date(collectedAtRaw).toISOString()
			: new Date().toISOString();

		// Derive catalog ref: use the case's caseRef short-code + a 3-digit seq
		const caseRow = db
			.prepare("SELECT caseRef FROM cases WHERE id = ?")
			.get(caseId) as { caseRef: string };
		const caseShort =
			caseRow.caseRef.split("-").pop()?.replace(/^0+/, "") ?? "000";
		const existingCount = (
			db
				.prepare(
					"SELECT COUNT(*) as n FROM evidence WHERE caseId = ?",
				)
				.get(caseId) as { n: number }
		).n;
		const catalogRef = `EVD-${caseShort.padStart(4, "0")}-${String(existingCount + 1).padStart(3, "0")}`;

		const id = `evd-${randomUUID().slice(0, 8)}`;
		let imagePath = "";

		if (image) {
			if (!ALLOWED_MIME[image.type])
				return NextResponse.json(
					{
						error: `Unsupported image type ${image.type}. Allowed: ${Object.keys(ALLOWED_MIME).join(", ")}`,
					},
					{ status: 415 },
				);
			if (image.size > MAX_IMAGE_BYTES)
				return NextResponse.json(
					{
						error: `Image too large (${Math.round(image.size / 1024)} KB, max ${MAX_IMAGE_BYTES / 1024 / 1024} MB)`,
					},
					{ status: 413 },
				);

			if (!fs.existsSync(IMAGE_DIR))
				fs.mkdirSync(IMAGE_DIR, { recursive: true });

			const ext = ALLOWED_MIME[image.type];
			const filename = `${id}${ext}`;
			const fullPath = path.join(IMAGE_DIR, filename);
			const bytes = new Uint8Array(await image.arrayBuffer());
			fs.writeFileSync(fullPath, bytes);
			imagePath = filename;
		}

		db.prepare(
			`INSERT INTO evidence
			 (id,caseId,catalogRef,type,description,collectedAt,location,analyst,notes,confidence,imagePath)
			 VALUES ($id,$caseId,$catalogRef,$type,$description,$collectedAt,$location,$analyst,$notes,$confidence,$imagePath)`,
		).run({
			id,
			caseId,
			catalogRef,
			type,
			description,
			collectedAt,
			location,
			analyst,
			notes,
			confidence,
			imagePath,
		});

		// Keep the denormalised evidenceCount fresh.
		db.prepare(
			"UPDATE cases SET evidenceCount = (SELECT COUNT(*) FROM evidence WHERE caseId = $id) WHERE id = $id",
		).run({ id: caseId });

		db.prepare(
			`INSERT INTO case_activities (id,caseId,type,description,createdAt,agent)
			 VALUES ($id,$caseId,$type,$description,$createdAt,$agent)`,
		).run({
			id: `act-${randomUUID().slice(0, 8)}`,
			caseId,
			type: "EVIDENCE_ADDED",
			description: `${type} evidence ${catalogRef} added: ${description.slice(0, 80)}${description.length > 80 ? "..." : ""}${imagePath ? " (with image)" : ""}`,
			createdAt: new Date().toISOString(),
			agent: await getSessionAgentName(request),
		});

		const row = db.prepare("SELECT * FROM evidence WHERE id = ?").get(id);
		return NextResponse.json(row, { status: 201 });
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
