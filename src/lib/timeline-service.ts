import { db } from "@/lib/db";
import { reconstructTimeline } from "@/lib/ai-engine";
import type { TimelineReconstructionEvent as AiEvent } from "@/lib/ai-engine";
import { randomUUID, createHash } from "crypto";
import type {
	Case,
	AutopsyReport,
	TodEstimate,
	DigitalEvidence,
	Evidence,
} from "@/types";

/**
 * Stable-ish identifier for an event across regenerations. AI-generated
 * wording varies run to run, so this is a best-effort fingerprint (title +
 * time truncated to the hour) rather than a guaranteed match — good enough to
 * carry investigator review forward across most regenerations, not perfect.
 */
export function fingerprintEvent(title: string, time: string): string {
	const normalizedTitle = title
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, " ")
		.trim();
	const d = new Date(time);
	const normalizedTime = Number.isNaN(d.getTime())
		? time.slice(0, 13)
		: d.toISOString().slice(0, 13); // date + hour
	return createHash("sha1")
		.update(`${normalizedTitle}|${normalizedTime}`)
		.digest("hex")
		.slice(0, 16);
}

interface ReviewRow {
	eventKey: string;
	eventTitle: string;
	eventDescription: string;
	status: "confirmed" | "rejected";
}

/**
 * Runs a full timeline reconstruction for a case and persists it. Shared by
 * the manual "Regenerate" endpoint and the automatic background triggers
 * fired after autopsy analysis, TOD estimation, and digital/physical evidence
 * intake. Prior investigator reviews (confirm/reject) are fed back into the
 * prompt and re-applied to matching events in the new output.
 */
export async function generateAndSaveTimelineReconstruction(caseId: string) {
	const caseRow = db
		.prepare("SELECT * FROM cases WHERE id = ?")
		.get(caseId) as Case | undefined;
	if (!caseRow) throw new Error("Case not found");

	const autopsy = db
		.prepare(
			"SELECT * FROM autopsy_reports WHERE caseId = ? ORDER BY analyzedAt DESC LIMIT 1",
		)
		.get(caseId) as AutopsyReport | undefined;

	const tod = db
		.prepare(
			"SELECT * FROM tod_estimates WHERE caseId = ? ORDER BY estimatedAt DESC LIMIT 1",
		)
		.get(caseId) as TodEstimate | undefined;

	const digitalEvidence = db
		.prepare(
			"SELECT * FROM digital_evidence WHERE caseId = ? ORDER BY timestamp ASC",
		)
		.all(caseId) as DigitalEvidence[];

	const physicalEvidence = db
		.prepare(
			"SELECT * FROM evidence WHERE caseId = ? ORDER BY collectedAt ASC",
		)
		.all(caseId) as Evidence[];

	const reviews = db
		.prepare(
			"SELECT eventKey, eventTitle, eventDescription, status FROM timeline_event_reviews WHERE caseId = ?",
		)
		.all(caseId) as ReviewRow[];
	const reviewByKey = new Map(reviews.map((r) => [r.eventKey, r]));

	const result = await reconstructTimeline({
		caseTitle: caseRow.title,
		caseDescription: caseRow.description,
		dateOfIncident: caseRow.dateOfIncident,
		victimName: caseRow.victimName,
		location: caseRow.location,
		autopsy: autopsy
			? {
					causeOfDeath: autopsy.causeOfDeath,
					mannerOfDeath: autopsy.mannerOfDeath,
					postmortemInterval: autopsy.postmortemInterval,
					injuryPattern: autopsy.injuryPattern,
					analyzedAt: autopsy.analyzedAt,
				}
			: undefined,
		tod: tod
			? {
					estimatedTodEarliest: tod.estimatedTodEarliest,
					estimatedTodLatest: tod.estimatedTodLatest,
					centralEstimate: tod.centralEstimate,
					methodology: tod.methodology,
				}
			: undefined,
		digitalEvents: digitalEvidence.map((e) => ({
			sourceType: e.sourceType,
			sourceName: e.sourceName,
			timestamp: e.timestamp,
			location: e.location,
			subject: e.subject,
			description: e.description,
			anomalyScore: e.anomalyScore,
		})),
		physicalEvidence: physicalEvidence.map((e) => ({
			catalogRef: e.catalogRef,
			type: e.type,
			description: e.description,
			collectedAt: e.collectedAt,
			location: e.location,
			analyst: e.analyst,
		})),
		priorReviews: {
			confirmed: reviews
				.filter((r) => r.status === "confirmed")
				.map((r) => `${r.eventTitle} — ${r.eventDescription}`),
			rejected: reviews
				.filter((r) => r.status === "rejected")
				.map((r) => `${r.eventTitle} — ${r.eventDescription}`),
		},
	});

	// Attach a stable-ish key to each event and re-apply any prior review that
	// matches (best-effort — see fingerprintEvent).
	const eventsWithReview: (AiEvent & {
		key: string;
		status: "pending" | "confirmed" | "rejected";
	})[] = result.events.map((e) => {
		const key = fingerprintEvent(e.title, e.time);
		const review = reviewByKey.get(key);
		return { ...e, key, status: review?.status ?? "pending" };
	});

	const id = `tl-${randomUUID().slice(0, 8)}`;
	const generatedAt = new Date().toISOString();

	db.prepare(
		`INSERT INTO timeline_reconstructions
		 (id,caseId,generatedAt,summary,events,inconsistencies,confidence)
		 VALUES ($id,$caseId,$generatedAt,$summary,$events,$inconsistencies,$confidence)`,
	).run({
		id,
		caseId,
		generatedAt,
		summary: result.summary,
		events: JSON.stringify(eventsWithReview),
		inconsistencies: JSON.stringify(result.inconsistencies),
		confidence: result.confidence,
	});

	return {
		id,
		caseId,
		generatedAt,
		...result,
		events: eventsWithReview,
	};
}

/**
 * Fire-and-forget trigger for routes that add evidence feeding the timeline
 * (autopsy analysis, TOD estimate, digital/physical evidence intake). Does
 * not block the caller's response — errors are logged, never thrown, so a
 * background regeneration failure can't take down the request that
 * triggered it.
 */
export function triggerTimelineRegeneration(caseId: string): void {
	generateAndSaveTimelineReconstruction(caseId)
		.then((result) => {
			const highSeverity = result.inconsistencies.filter(
				(i) => i.severity === "HIGH",
			);
			db.prepare(
				`INSERT INTO case_activities (id,caseId,type,description,createdAt,agent)
				 VALUES ($id,$caseId,$type,$description,$createdAt,$agent)`,
			).run({
				id: `act-${randomUUID().slice(0, 8)}`,
				caseId,
				type: "ANALYSIS_RUN",
				description:
					"Timeline reconstruction auto-regenerated after new evidence." +
					(highSeverity.length > 0
						? ` ${highSeverity.length} HIGH-severity inconsistenc${highSeverity.length === 1 ? "y" : "ies"} flagged.`
						: ""),
				createdAt: new Date().toISOString(),
				agent: "KAVALAN AI Engine",
			});
		})
		.catch((err) => {
			console.warn(
				`Background timeline regeneration failed for case ${caseId}:`,
				(err as Error).message,
			);
		});
}
