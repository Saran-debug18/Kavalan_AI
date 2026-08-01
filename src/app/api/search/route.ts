export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

interface SearchResult {
	type: "case" | "evidence" | "digital";
	caseId: string;
	caseRef: string;
	caseTitle: string;
	label: string;
	detail: string;
}

const LIMIT = 8;

export async function GET(request: NextRequest) {
	try {
		const { searchParams } = new URL(request.url);
		const q = (searchParams.get("q") ?? "").trim();
		if (q.length < 2) return NextResponse.json({ results: [] });

		const like = `%${q}%`;
		const results: SearchResult[] = [];

		const cases = db
			.prepare(
				`SELECT id, caseRef, title, victimName, location, tags FROM cases
				 WHERE caseRef LIKE ? OR title LIKE ? OR victimName LIKE ? OR location LIKE ? OR tags LIKE ?
				 ORDER BY dateCreated DESC LIMIT ?`,
			)
			.all(like, like, like, like, like, LIMIT) as {
			id: string;
			caseRef: string;
			title: string;
			victimName: string;
			location: string;
		}[];
		for (const c of cases) {
			results.push({
				type: "case",
				caseId: c.id,
				caseRef: c.caseRef,
				caseTitle: c.title,
				label: c.title,
				detail: [c.victimName, c.location].filter(Boolean).join(" · "),
			});
		}

		const evidence = db
			.prepare(
				`SELECT e.id, e.catalogRef, e.description, e.type, c.id as caseId, c.caseRef, c.title
				 FROM evidence e JOIN cases c ON c.id = e.caseId
				 WHERE e.description LIKE ? OR e.catalogRef LIKE ? OR e.notes LIKE ?
				 ORDER BY e.collectedAt DESC LIMIT ?`,
			)
			.all(like, like, like, LIMIT) as {
			id: string;
			catalogRef: string;
			description: string;
			type: string;
			caseId: string;
			caseRef: string;
			title: string;
		}[];
		for (const e of evidence) {
			results.push({
				type: "evidence",
				caseId: e.caseId,
				caseRef: e.caseRef,
				caseTitle: e.title,
				label: `${e.catalogRef} — ${e.type}`,
				detail: e.description,
			});
		}

		const digital = db
			.prepare(
				`SELECT d.id, d.sourceName, d.subject, d.description, c.id as caseId, c.caseRef, c.title
				 FROM digital_evidence d JOIN cases c ON c.id = d.caseId
				 WHERE d.subject LIKE ? OR d.description LIKE ? OR d.sourceName LIKE ?
				 ORDER BY d.timestamp DESC LIMIT ?`,
			)
			.all(like, like, like, LIMIT) as {
			id: string;
			sourceName: string;
			subject: string;
			description: string;
			caseId: string;
			caseRef: string;
			title: string;
		}[];
		for (const d of digital) {
			results.push({
				type: "digital",
				caseId: d.caseId,
				caseRef: d.caseRef,
				caseTitle: d.title,
				label: d.subject || d.sourceName,
				detail: d.description,
			});
		}

		return NextResponse.json({ results: results.slice(0, 20) });
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
