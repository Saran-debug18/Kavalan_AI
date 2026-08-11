export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { getSessionAgentName } from "@/lib/auth";

export async function GET(
	_request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const { id } = params;
		const caseRow = db.prepare("SELECT * FROM cases WHERE id = ?").get(id);
		if (!caseRow)
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const evidence = db
			.prepare(
				"SELECT * FROM evidence WHERE caseId = ? ORDER BY collectedAt DESC",
			)
			.all(id);
		const activities = db
			.prepare(
				"SELECT * FROM case_activities WHERE caseId = ? ORDER BY createdAt DESC",
			)
			.all(id);
		const autopsyReports = db
			.prepare(
				"SELECT * FROM autopsy_reports WHERE caseId = ? ORDER BY analyzedAt DESC",
			)
			.all(id);
		const digitalEvidence = db
			.prepare(
				"SELECT * FROM digital_evidence WHERE caseId = ? ORDER BY timestamp ASC",
			)
			.all(id);
		const todEstimates = db
			.prepare(
				"SELECT * FROM tod_estimates WHERE caseId = ? ORDER BY estimatedAt DESC",
			)
			.all(id);
		const timelineReconstructionsRaw = db
			.prepare(
				"SELECT * FROM timeline_reconstructions WHERE caseId = ? ORDER BY generatedAt DESC",
			)
			.all(id) as Array<Record<string, unknown>>;
		const timelineReconstructions = timelineReconstructionsRaw.map((row) => ({
			...row,
			events: JSON.parse((row.events as string) ?? "[]"),
			inconsistencies: JSON.parse((row.inconsistencies as string) ?? "[]"),
		}));

		return NextResponse.json({
			...caseRow,
			evidence,
			activities,
			autopsyReports,
			digitalEvidence,
			todEstimates,
			timelineReconstructions,
		});
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}

export async function PATCH(
	request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const { id } = params;
		const body = await request.json();
		const existing = db.prepare("SELECT * FROM cases WHERE id = ?").get(id);
		if (!existing)
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const allowed = [
			"title",
			"description",
			"status",
			"riskLevel",
			"riskScore",
			"location",
			"dateOfIncident",
			"assignedAgent",
			"suspectCount",
			"evidenceCount",
			"victimName",
			"tags",
		];
		const setClauses: string[] = [];
		const updateParams: Record<string, unknown> = { id: id };

		for (const field of allowed) {
			if (field in body) {
				setClauses.push(`${field} = $${field}`);
				updateParams[field] = body[field];
			}
		}
		if (setClauses.length === 0)
			return NextResponse.json({ error: "No valid fields" }, { status: 400 });

		db.prepare(`UPDATE cases SET ${setClauses.join(", ")} WHERE id = $id`).run(
			updateParams,
		);

		// Audit log: write STATUS_CHANGED when status actually changes.
		const prev = existing as { status?: string };
		if (
			"status" in body &&
			typeof body.status === "string" &&
			body.status !== prev.status
		) {
			db.prepare(
				"INSERT INTO case_activities (id,caseId,type,description,createdAt,agent) VALUES ($id,$caseId,$type,$description,$createdAt,$agent)",
			).run({
				id: `act-${randomUUID().slice(0, 8)}`,
				caseId: id,
				type: "STATUS_CHANGED",
				description: `Case status changed from ${prev.status ?? "?"} to ${body.status}.`,
				createdAt: new Date().toISOString(),
				agent: await getSessionAgentName(request),
			});
		}

		return NextResponse.json(
			db.prepare("SELECT * FROM cases WHERE id = ?").get(id),
		);
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}

export async function DELETE(
	_request: NextRequest,
	{ params }: { params: { id: string } },
) {
	try {
		const { id } = params;
		if (!db.prepare("SELECT id FROM cases WHERE id = ?").get(id))
			return NextResponse.json({ error: "Case not found" }, { status: 404 });
		db.prepare("DELETE FROM cases WHERE id = ?").run(id);
		return NextResponse.json({ success: true, id });
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
