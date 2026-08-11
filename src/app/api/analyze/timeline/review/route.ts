export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import { getSessionAgentName } from "@/lib/auth";
import type { TimelineEvent } from "@/types";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json();
		const { caseId, eventKey, eventTitle, eventDescription, status } = body;

		if (!caseId || !eventKey || !status)
			return NextResponse.json(
				{ error: "caseId, eventKey, and status are required" },
				{ status: 400 },
			);
		if (!["confirmed", "rejected", "pending"].includes(status))
			return NextResponse.json(
				{ error: "status must be one of confirmed, rejected, pending" },
				{ status: 400 },
			);

		if (!db.prepare("SELECT id FROM cases WHERE id = ?").get(caseId))
			return NextResponse.json({ error: "Case not found" }, { status: 404 });

		const reviewedBy = await getSessionAgentName(request);
		const reviewedAt = new Date().toISOString();

		if (status === "pending") {
			db.prepare(
				"DELETE FROM timeline_event_reviews WHERE caseId = ? AND eventKey = ?",
			).run(caseId, eventKey);
		} else {
			db.prepare(
				`INSERT INTO timeline_event_reviews
				 (id,caseId,eventKey,eventTitle,eventDescription,status,reviewedBy,reviewedAt)
				 VALUES ($id,$caseId,$eventKey,$eventTitle,$eventDescription,$status,$reviewedBy,$reviewedAt)
				 ON CONFLICT(caseId, eventKey) DO UPDATE SET
				   status = excluded.status,
				   eventTitle = excluded.eventTitle,
				   eventDescription = excluded.eventDescription,
				   reviewedBy = excluded.reviewedBy,
				   reviewedAt = excluded.reviewedAt`,
			).run({
				id: `tlr-${randomUUID().slice(0, 8)}`,
				caseId,
				eventKey,
				eventTitle: eventTitle ?? "",
				eventDescription: eventDescription ?? "",
				status,
				reviewedBy,
				reviewedAt,
			});
		}

		// Reflect the new status immediately in the latest saved reconstruction,
		// so the UI doesn't need a full regeneration to show it.
		const latest = db
			.prepare(
				"SELECT id, events FROM timeline_reconstructions WHERE caseId = ? ORDER BY generatedAt DESC LIMIT 1",
			)
			.get(caseId) as { id: string; events: string } | undefined;

		if (latest) {
			const events = JSON.parse(latest.events) as TimelineEvent[];
			const updated = events.map((e) =>
				e.key === eventKey ? { ...e, status } : e,
			);
			db.prepare("UPDATE timeline_reconstructions SET events = ? WHERE id = ?").run(
				JSON.stringify(updated),
				latest.id,
			);
		}

		return NextResponse.json({ caseId, eventKey, status, reviewedBy, reviewedAt });
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
