export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { estimateTod } from "@/lib/ai-engine";
import type { TodInput } from "@/lib/ai-engine";
import { triggerTimelineRegeneration } from "@/lib/timeline-service";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const {
			caseId,
			bodyTemp,
			ambientTemp,
			rigorMortisStage,
			livorMortisState,
			lastSeenAlive,
			weight,
		} = body;

		if (!caseId || bodyTemp === undefined || ambientTemp === undefined)
			return NextResponse.json(
				{ error: "caseId, bodyTemp, and ambientTemp are required" },
				{ status: 400 },
			);

		// Physical plausibility bounds
		if (!Number.isFinite(bodyTemp) || bodyTemp < 0 || bodyTemp > 42)
			return NextResponse.json(
				{ error: "bodyTemp must be between 0 and 42 °C" },
				{ status: 400 },
			);
		if (!Number.isFinite(ambientTemp) || ambientTemp < -40 || ambientTemp > 60)
			return NextResponse.json(
				{ error: "ambientTemp must be between -40 and 60 °C" },
				{ status: 400 },
			);
		if (
			weight !== undefined &&
			(!Number.isFinite(weight) || weight < 2 || weight > 300)
		)
			return NextResponse.json(
				{ error: "weight must be between 2 and 300 kg" },
				{ status: 400 },
			);

		if (!db.prepare("SELECT id FROM cases WHERE id = ?").get(caseId))
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const input: TodInput = {
			bodyTemp,
			ambientTemp,
			rigorMortisStage: rigorMortisStage ?? 1,
			livorMortisState: livorMortisState ?? "faint",
			lastSeenAlive: lastSeenAlive ?? "",
			weight: weight ?? 70,
		};

		const result = estimateTod(input);
		const id = `tod-${randomUUID().slice(0, 8)}`;
		const estimatedAt = new Date().toISOString();

		db.prepare(`
      INSERT INTO tod_estimates
        (id,caseId,estimatedAt,bodyTemp,ambientTemp,rigorMortisStage,livorMortisState,
         lastSeenAlive,estimatedTodEarliest,estimatedTodLatest,centralEstimate,confidenceLevel,methodology,notes)
      VALUES
        ($id,$caseId,$estimatedAt,$bodyTemp,$ambientTemp,$rigorMortisStage,$livorMortisState,
         $lastSeenAlive,$estimatedTodEarliest,$estimatedTodLatest,$centralEstimate,$confidenceLevel,$methodology,$notes)
    `).run({
			id: id,
			caseId: caseId,
			estimatedAt: estimatedAt,
			bodyTemp: bodyTemp,
			ambientTemp: ambientTemp,
			rigorMortisStage: input.rigorMortisStage,
			livorMortisState: input.livorMortisState,
			lastSeenAlive: input.lastSeenAlive ?? "",
			estimatedTodEarliest: result.estimatedTodEarliest,
			estimatedTodLatest: result.estimatedTodLatest,
			centralEstimate: result.centralEstimate,
			confidenceLevel: result.confidenceLevel,
			methodology: result.methodology,
			notes: result.notes,
		});

		db.prepare(
			`INSERT INTO case_activities (id,caseId,type,description,createdAt,agent) VALUES ($id,$caseId,$type,$description,$createdAt,$agent)`,
		).run({
			id: `act-${randomUUID().slice(0, 8)}`,
			caseId: caseId,
			type: "ANALYSIS_RUN",
			description: `TOD estimated. PMI: ${result.pmhHours.min}-${result.pmhHours.max}h. Confidence: ${result.confidenceLevel}%.`,
			createdAt: estimatedAt,
			agent: "KAVALAN AI Engine",
		});

		triggerTimelineRegeneration(caseId);

		return NextResponse.json({ id, caseId, estimatedAt, ...result });
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
