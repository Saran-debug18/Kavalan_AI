export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { generateAndSaveTimelineReconstruction } from "@/lib/timeline-service";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { caseId } = body;

		if (!caseId)
			return NextResponse.json({ error: "caseId is required" }, { status: 400 });

		if (!db.prepare("SELECT id FROM cases WHERE id = ?").get(caseId))
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const result = await generateAndSaveTimelineReconstruction(caseId);

		db.prepare(
			`INSERT INTO case_activities (id,caseId,type,description,createdAt,agent)
			 VALUES ($id,$caseId,$type,$description,$createdAt,$agent)`,
		).run({
			id: `act-${randomUUID().slice(0, 8)}`,
			caseId,
			type: "ANALYSIS_RUN",
			description: `Timeline reconstruction generated: ${result.events.length} event(s), ${result.inconsistencies.length} inconsistenc${result.inconsistencies.length === 1 ? "y" : "ies"} flagged.`,
			createdAt: result.generatedAt,
			agent: "KAVALAN AI Engine",
		});

		return NextResponse.json(result);
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
