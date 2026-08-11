export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type CaseStatus = "OPEN" | "ACTIVE" | "PENDING" | "CLOSED" | "COLD";
export type EvidenceType =
	| "PHYSICAL"
	| "DIGITAL"
	| "BIOLOGICAL"
	| "TESTIMONIAL"
	| "FORENSIC";
export type DigitalSourceType =
	| "CCTV"
	| "MOBILE"
	| "FINANCIAL"
	| "SOCIAL"
	| "GPS"
	| "EMAIL"
	| "BROWSER";

export interface Case {
	id: string;
	caseRef: string;
	title: string;
	description: string;
	status: CaseStatus;
	riskLevel: RiskLevel;
	riskScore: number;
	location: string;
	dateCreated: string;
	dateOfIncident: string;
	assignedAgent: string;
	suspectCount: number;
	evidenceCount: number;
	victimName: string;
	tags: string; // JSON array string
}

export interface Evidence {
	id: string;
	caseId: string;
	catalogRef: string;
	type: EvidenceType;
	description: string;
	collectedAt: string;
	location: string;
	analyst: string;
	notes: string;
	confidence: number;
	imagePath?: string;
}

export interface AutopsyReport {
	id: string;
	caseId: string;
	rawReport: string;
	analyzedAt: string;
	causeOfDeath: string;
	mannerOfDeath: string;
	postmortemInterval: string;
	injuryPattern: string;
	toxicologyFindings: string;
	woundsCount: number;
	bodyTemperature: number;
	rigorMortisStage: number;
	livorMortisState: string;
	confidence: number;
	analysisNotes: string;
}

export interface TodEstimate {
	id: string;
	caseId: string;
	estimatedAt: string;
	bodyTemp: number;
	ambientTemp: number;
	rigorMortisStage: number;
	livorMortisState: string;
	lastSeenAlive: string;
	estimatedTodEarliest: string;
	estimatedTodLatest: string;
	centralEstimate?: string;
	confidenceLevel: number;
	methodology: string;
	notes: string;
}

export interface DigitalEvidence {
	id: string;
	caseId: string;
	sourceType: DigitalSourceType;
	sourceName: string;
	timestamp: string;
	location: string;
	subject: string;
	description: string;
	confidence: number;
	anomalyScore: number;
	tags: string; // JSON array string
}

export interface TimelineEvent {
	time: string; // ISO timestamp, or a descriptive range if exact time is unknown
	title: string;
	description: string;
	confidence: number; // 0-100
	sourceType: "DIGITAL" | "AUTOPSY" | "TOD" | "EVIDENCE" | "INFERRED";
	evidenceRef?: string;
	key?: string; // stable-ish fingerprint used for investigator review persistence
	status?: "pending" | "confirmed" | "rejected";
}

export interface TimelineInconsistency {
	description: string;
	severity: "LOW" | "MEDIUM" | "HIGH";
}

export interface TimelineReconstruction {
	id: string;
	caseId: string;
	generatedAt: string;
	summary: string;
	events: TimelineEvent[];
	inconsistencies: TimelineInconsistency[];
	confidence: number;
}

export interface CaseActivity {
	id: string;
	caseId: string;
	type:
		| "EVIDENCE_ADDED"
		| "ANALYSIS_RUN"
		| "REPORT_GENERATED"
		| "STATUS_CHANGED"
		| "NOTE_ADDED";
	description: string;
	createdAt: string;
	agent: string;
}

export interface RiskSummary {
	overall: number;
	tier: RiskLevel;
	factors: { label: string; score: number; weight: number }[];
	anomalies: string[];
	recommendations: string[];
}

export type GraphNodeType = "VICTIM" | "SUBJECT" | "LOCATION" | "DEVICE";

export interface GraphNode {
	id: string; // stable derived key, e.g. "subject:john-doe"
	label: string;
	type: GraphNodeType;
	anomalyScore?: number; // 0-100, drives size/color for SUBJECT/DEVICE
	connectionCount: number; // computed post-edge-build
	sourceRefs: string[]; // underlying evidence/digitalEvidence ids, for tooltip drill-down
}

export interface GraphEdge {
	id: string; // `${source}--${target}--${kind}`
	source: string;
	target: string;
	kind: "SAME_SUBJECT" | "CO_LOCATION" | "TIME_PROXIMITY" | "CASE_LINK";
	weight: number;
}

export interface CaseGraph {
	nodes: GraphNode[];
	edges: GraphEdge[];
}
