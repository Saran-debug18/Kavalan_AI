import type { CaseGraph, GraphEdge, GraphNode, GraphNodeType, Evidence, DigitalEvidence } from "@/types";

const TIME_PROXIMITY_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

interface BuildGraphInput {
	victimName: string;
	evidence: Evidence[];
	digitalEvidence: DigitalEvidence[];
}

function normalize(s: string): string {
	return s.trim().toLowerCase();
}

function slug(s: string): string {
	return normalize(s).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function subjectKey(subject: string): string {
	return `subject:${slug(subject)}`;
}

function locationKey(location: string): string {
	return `location:${slug(location)}`;
}

function deviceKey(sourceType: string, sourceName: string): string {
	return `device:${slug(sourceType)}-${slug(sourceName)}`;
}

/**
 * Derives a "detective board" style graph — nodes for the victim, subjects,
 * locations, and devices, connected by relationships inferred from
 * co-occurrence in evidence/digital-evidence records. Everything here is
 * computed client-side from data that already exists; nothing is stored.
 */
export function buildCaseGraph(input: BuildGraphInput): CaseGraph {
	const { victimName, evidence, digitalEvidence } = input;

	const nodes = new Map<string, GraphNode>();
	const edges = new Map<string, GraphEdge>();

	function upsertNode(
		id: string,
		label: string,
		type: GraphNodeType,
		sourceRef?: string,
	): GraphNode {
		const existing = nodes.get(id);
		if (existing) {
			if (sourceRef && !existing.sourceRefs.includes(sourceRef)) {
				existing.sourceRefs.push(sourceRef);
			}
			return existing;
		}
		const node: GraphNode = {
			id,
			label,
			type,
			connectionCount: 0,
			sourceRefs: sourceRef ? [sourceRef] : [],
		};
		nodes.set(id, node);
		return node;
	}

	function upsertEdge(
		source: string,
		target: string,
		kind: GraphEdge["kind"],
	): void {
		if (source === target) return;
		// Undirected — canonicalize ordering so a--b and b--a merge into one edge.
		const [a, b] = [source, target].sort();
		const id = `${a}--${b}--${kind}`;
		const existing = edges.get(id);
		if (existing) {
			existing.weight += 1;
		} else {
			edges.set(id, { id, source: a, target: b, kind, weight: 1 });
		}
	}

	const victimId = victimName.trim() ? "victim:main" : null;
	if (victimId) upsertNode(victimId, victimName.trim(), "VICTIM");

	// Locations from the physical/biological/forensic evidence catalog.
	for (const e of evidence) {
		const loc = e.location?.trim();
		if (loc) upsertNode(locationKey(loc), loc, "LOCATION", e.id);
	}

	// Anomaly-score aggregation per subject/device — track max seen.
	const subjectAnomaly = new Map<string, number>();
	const deviceAnomaly = new Map<string, number>();

	for (const d of digitalEvidence) {
		const subject = d.subject?.trim();
		const location = d.location?.trim();
		const hasDevice = d.sourceName?.trim() || d.sourceType;

		if (subject) {
			const sId = subjectKey(subject);
			upsertNode(sId, subject, "SUBJECT", d.id);
			subjectAnomaly.set(sId, Math.max(subjectAnomaly.get(sId) ?? 0, d.anomalyScore ?? 0));
		}
		if (location) {
			upsertNode(locationKey(location), location, "LOCATION", d.id);
		}
		if (hasDevice) {
			const dId = deviceKey(d.sourceType, d.sourceName || d.sourceType);
			const label = `${d.sourceName || d.sourceType} (${d.sourceType})`;
			upsertNode(dId, label, "DEVICE", d.id);
			deviceAnomaly.set(dId, Math.max(deviceAnomaly.get(dId) ?? 0, d.anomalyScore ?? 0));
		}

		// SAME_SUBJECT edges: this row's subject connects to this row's
		// device and location.
		if (subject) {
			const sId = subjectKey(subject);
			if (hasDevice) {
				upsertEdge(sId, deviceKey(d.sourceType, d.sourceName || d.sourceType), "SAME_SUBJECT");
			}
			if (location) {
				upsertEdge(sId, locationKey(location), "SAME_SUBJECT");
			}
		}
	}

	for (const [id, score] of subjectAnomaly) {
		const n = nodes.get(id);
		if (n) n.anomalyScore = score;
	}
	for (const [id, score] of deviceAnomaly) {
		const n = nodes.get(id);
		if (n) n.anomalyScore = score;
	}

	// CO_LOCATION: subjects sharing an exact location string.
	const bySubjectLocation = new Map<string, Set<string>>(); // subjectId -> set of locationIds
	for (const d of digitalEvidence) {
		const subject = d.subject?.trim();
		const location = d.location?.trim();
		if (!subject || !location) continue;
		const sId = subjectKey(subject);
		const lId = locationKey(location);
		if (!bySubjectLocation.has(sId)) bySubjectLocation.set(sId, new Set());
		bySubjectLocation.get(sId)!.add(lId);
	}
	const subjectIds = Array.from(bySubjectLocation.keys());
	for (let i = 0; i < subjectIds.length; i++) {
		for (let j = i + 1; j < subjectIds.length; j++) {
			const a = bySubjectLocation.get(subjectIds[i])!;
			const b = bySubjectLocation.get(subjectIds[j])!;
			const shared = Array.from(a).some((loc) => b.has(loc));
			if (shared) upsertEdge(subjectIds[i], subjectIds[j], "CO_LOCATION");
		}
	}

	// TIME_PROXIMITY: subjects with records within the time window of each
	// other. Sliding window over rows sorted by timestamp, not a full O(n^2)
	// pairwise scan.
	const timedRows = digitalEvidence
		.filter((d) => d.subject?.trim() && d.timestamp)
		.map((d) => ({
			subjectId: subjectKey(d.subject.trim()),
			t: new Date(d.timestamp).getTime(),
		}))
		.filter((r) => Number.isFinite(r.t))
		.sort((a, b) => a.t - b.t);

	let windowStart = 0;
	for (let i = 0; i < timedRows.length; i++) {
		while (timedRows[i].t - timedRows[windowStart].t > TIME_PROXIMITY_WINDOW_MS) {
			windowStart++;
		}
		for (let j = windowStart; j < i; j++) {
			if (timedRows[j].subjectId !== timedRows[i].subjectId) {
				upsertEdge(timedRows[j].subjectId, timedRows[i].subjectId, "TIME_PROXIMITY");
			}
		}
	}

	// CASE_LINK fallback: any subject with zero other edges gets linked to
	// the victim, so nothing renders fully disconnected.
	if (victimId) {
		const connected = new Set<string>();
		for (const e of edges.values()) {
			connected.add(e.source);
			connected.add(e.target);
		}
		for (const node of nodes.values()) {
			if (node.type === "SUBJECT" && !connected.has(node.id)) {
				upsertEdge(victimId, node.id, "CASE_LINK");
			}
		}
	}

	// Post-process: connection counts.
	for (const node of nodes.values()) node.connectionCount = 0;
	for (const edge of edges.values()) {
		const a = nodes.get(edge.source);
		const b = nodes.get(edge.target);
		if (a) a.connectionCount += 1;
		if (b) b.connectionCount += 1;
	}

	return {
		nodes: Array.from(nodes.values()),
		edges: Array.from(edges.values()),
	};
}
