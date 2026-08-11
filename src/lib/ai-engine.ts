/**
 * KAVALAN AI Engine
 * - Autopsy analysis: Llama 3.3 70B via Groq (real NLP)
 * - Digital correlation: Llama 3.3 70B via Groq (real intelligence)
 * - Image evidence extraction: Llama 3.2 Vision via Groq (multimodal)
 * - TOD estimation: Henssge nomogram (real forensic math, no AI needed)
 * - Risk scoring: weighted formula (deterministic, auditable)
 */
import type { RiskLevel } from "@/types";
import { db } from "@/lib/db";
import {
	henssgeNomogram,
	rigorMortisToHours,
	livorMortisToHours,
	combineTimeRanges,
	hoursToIso,
	calculateAnomaly,
} from "@/lib/forensics";

// ─── LLM client (Groq, OpenAI-compatible) ────────────────────────────────────

const GROQ_BASE_URL =
	process.env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1";
const GROQ_MODEL = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
const GROQ_VISION_MODEL =
	process.env.GROQ_VISION_MODEL ?? "meta-llama/llama-4-scout-17b-16e-instruct";

function getTextKey(): string {
	const key = process.env.GROQ_API_KEY;
	if (!key) throw new Error("GROQ_API_KEY not set");
	return key;
}

function getVisionKey(): string {
	// Prefer a dedicated vision key if set, else fall back to the text key.
	const key = process.env.GROQ_VISION_API_KEY ?? process.env.GROQ_API_KEY;
	if (!key)
		throw new Error(
			"GROQ_VISION_API_KEY or GROQ_API_KEY must be set for vision calls",
		);
	return key;
}

// DB handle for AI call telemetry (imported statically above).
function logDb() {
	return db;
}

function logAiCall(row: {
	purpose: string;
	model: string;
	durationMs: number;
	status: "ok" | "error";
	promptChars: number;
	responseChars: number;
	errorMessage?: string;
	samplePrompt?: string;
	sampleResponse?: string;
}) {
	const d = logDb();
	if (!d) return;
	try {
		d.prepare(
			`INSERT INTO ai_calls
			 (id,createdAt,purpose,provider,model,durationMs,status,promptChars,responseChars,errorMessage,samplePrompt,sampleResponse)
			 VALUES ($id,$createdAt,$purpose,$provider,$model,$durationMs,$status,$promptChars,$responseChars,$errorMessage,$samplePrompt,$sampleResponse)`,
		).run({
			id: `aic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
			createdAt: new Date().toISOString(),
			purpose: row.purpose,
			provider: "groq",
			model: row.model,
			durationMs: row.durationMs,
			status: row.status,
			promptChars: row.promptChars,
			responseChars: row.responseChars,
			errorMessage: row.errorMessage ?? "",
			samplePrompt: (row.samplePrompt ?? "").slice(0, 400),
			sampleResponse: (row.sampleResponse ?? "").slice(0, 400),
		});
	} catch (e) {
		console.warn("ai_calls log failed:", (e as Error).message);
	}
	console.log(
		`[AI] ${row.purpose} ${row.status} ${row.model} ${row.durationMs}ms promptChars=${row.promptChars} respChars=${row.responseChars}`,
	);
}

async function callClaude(
	systemPrompt: string,
	userMessage: string,
	maxTokens = 1024,
	purpose = "text",
): Promise<string> {
	const apiKey = getTextKey();
	const startedAt = Date.now();

	const body = {
		model: GROQ_MODEL,
		max_tokens: maxTokens,
		temperature: 0.2,
		response_format: { type: "json_object" },
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content: userMessage },
		],
	};

	try {
		const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const err = await res.text();
			logAiCall({
				purpose,
				model: GROQ_MODEL,
				durationMs: Date.now() - startedAt,
				status: "error",
				promptChars: systemPrompt.length + userMessage.length,
				responseChars: 0,
				errorMessage: `Groq ${res.status}: ${err.slice(0, 300)}`,
				samplePrompt: userMessage,
			});
			throw new Error(`Groq error ${res.status}: ${err}`);
		}

		const data = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const text = data.choices?.[0]?.message?.content ?? "";
		logAiCall({
			purpose,
			model: GROQ_MODEL,
			durationMs: Date.now() - startedAt,
			status: "ok",
			promptChars: systemPrompt.length + userMessage.length,
			responseChars: text.length,
			samplePrompt: userMessage,
			sampleResponse: text,
		});
		return text;
	} catch (err) {
		// network-level failure
		logAiCall({
			purpose,
			model: GROQ_MODEL,
			durationMs: Date.now() - startedAt,
			status: "error",
			promptChars: systemPrompt.length + userMessage.length,
			responseChars: 0,
			errorMessage: (err as Error).message,
			samplePrompt: userMessage,
		});
		throw err;
	}
}

/**
 * Multimodal variant: sends one or more images plus a text prompt to a Groq
 * vision model and returns the model's text response.
 */
export async function callClaudeVision(
	systemPrompt: string,
	userMessage: string,
	images: Array<{ mediaType: string; base64: string }>,
	maxTokens = 1024,
	purpose = "vision",
): Promise<string> {
	const apiKey = getVisionKey();
	const startedAt = Date.now();

	const content: Array<Record<string, unknown>> = images.map((img) => ({
		type: "image_url",
		image_url: {
			url: `data:${img.mediaType};base64,${img.base64}`,
		},
	}));
	content.push({ type: "text", text: userMessage });

	// Groq vision models don't always support response_format=json_object; keep
	// the prompt strict instead and parse defensively downstream.
	const body = {
		model: GROQ_VISION_MODEL,
		max_tokens: maxTokens,
		temperature: 0.2,
		messages: [
			{ role: "system", content: systemPrompt },
			{ role: "user", content },
		],
	};

	try {
		const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const err = await res.text();
			logAiCall({
				purpose,
				model: GROQ_VISION_MODEL,
				durationMs: Date.now() - startedAt,
				status: "error",
				promptChars: systemPrompt.length + userMessage.length,
				responseChars: 0,
				errorMessage: `Groq vision ${res.status}: ${err.slice(0, 300)}`,
				samplePrompt: userMessage,
			});
			throw new Error(`Groq vision error ${res.status}: ${err}`);
		}

		const data = (await res.json()) as {
			choices?: Array<{ message?: { content?: string } }>;
		};
		const text = data.choices?.[0]?.message?.content ?? "";
		logAiCall({
			purpose,
			model: GROQ_VISION_MODEL,
			durationMs: Date.now() - startedAt,
			status: "ok",
			promptChars: systemPrompt.length + userMessage.length,
			responseChars: text.length,
			samplePrompt: userMessage,
			sampleResponse: text,
		});
		return text;
	} catch (err) {
		logAiCall({
			purpose,
			model: GROQ_VISION_MODEL,
			durationMs: Date.now() - startedAt,
			status: "error",
			promptChars: systemPrompt.length + userMessage.length,
			responseChars: 0,
			errorMessage: (err as Error).message,
			samplePrompt: userMessage,
		});
		throw err;
	}
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface AutopsyAnalysisInput {
	reportText: string;
	bodyTemperature?: number;
	ambientTemperature?: number;
	rigorMortisStage?: number;
	livorMortisState?: string;
}

export interface AutopsyAnalysisResult {
	causeOfDeath: string;
	mannerOfDeath: string;
	postmortemInterval: string;
	injuryPattern: string;
	toxicologyFindings: string;
	woundsCount: number;
	confidence: number;
	analysisNotes: string;
	extractedKeywords: string[];
	timeOfDeathEstimate?: string;
}

export interface TodInput {
	bodyTemp: number;
	ambientTemp: number;
	rigorMortisStage: number;
	livorMortisState: string;
	lastSeenAlive?: string;
	weight?: number;
}

export interface TodResult {
	estimatedTodEarliest: string;
	estimatedTodLatest: string;
	centralEstimate: string;
	confidenceLevel: number;
	methodology: string;
	notes: string;
	pmhHours: { min: number; max: number; central: number };
}

export interface DigitalCorrelationInput {
	events: Array<{
		sourceType: string;
		sourceName?: string;
		timestamp: string;
		location: string;
		subject: string;
		description: string;
		anomalyScore?: number;
	}>;
}

export interface DigitalCorrelationResult {
	anomalies: Array<{
		type: string;
		severity: string;
		description: string;
		timestamps: string[];
	}>;
	timeline: Array<{
		timestamp: string;
		event: string;
		source: string;
		significance: string;
	}>;
	patterns: Array<{ pattern: string; confidence: number; subjects: string[] }>;
	riskContribution: number;
}

export interface RiskScoreInput {
	caseId: string;
	evidenceCount: number;
	suspectCount: number;
	digitalAnomalyCount: number;
	hasAutopsy: boolean;
	hasTodEstimate: boolean;
	mannerOfDeath?: string;
	openTimelinGaps: number;
	caseAgeHours: number;
}

export interface RiskScoreResult {
	overall: number;
	tier: RiskLevel;
	factors: Array<{
		label: string;
		score: number;
		weight: number;
		description: string;
	}>;
	anomalies: string[];
	recommendations: string[];
}

// ─── wound-count heuristic ────────────────────────────────────────────────────

const WOUND_INJURY_WORDS = [
	"wound",
	"wounds",
	"laceration",
	"lacerations",
	"injury",
	"injuries",
	"cut",
	"cuts",
	"slit",
	"slits",
	"slash",
	"slashes",
	"gash",
	"gashes",
	"scratch",
	"scratches",
	"abrasion",
	"abrasions",
	"contusion",
	"contusions",
	"bruise",
	"bruises",
	"fracture",
	"fractures",
	"stab",
	"stabs",
	"stabbing",
	"puncture",
	"punctures",
	"gunshot",
	"gsw",
	"entry",
	"exit",
	"burn",
	"burns",
	"bite",
	"bites",
	"hematoma",
	"hematomas",
	"fissure",
	"fissures",
	"perforation",
	"perforations",
	"incision",
	"incisions",
	"trauma",
];

const WOUND_BODY_PARTS = [
	"throat",
	"neck",
	"thigh",
	"chest",
	"abdomen",
	"stomach",
	"belly",
	"head",
	"skull",
	"forehead",
	"temple",
	"face",
	"jaw",
	"cheek",
	"eye",
	"ear",
	"nose",
	"mouth",
	"lip",
	"tongue",
	"back",
	"spine",
	"shoulder",
	"arm",
	"forearm",
	"elbow",
	"wrist",
	"hand",
	"finger",
	"palm",
	"leg",
	"calf",
	"shin",
	"knee",
	"ankle",
	"foot",
	"toe",
	"hip",
	"rib",
	"groin",
	"torso",
	"flank",
	"buttock",
	"scalp",
];

const WOUND_NUMBER_WORDS: Record<string, number> = {
	one: 1,
	two: 2,
	three: 3,
	four: 4,
	five: 5,
	six: 6,
	seven: 7,
	eight: 8,
	nine: 9,
	ten: 10,
	multiple: 3,
	several: 3,
	numerous: 4,
	many: 4,
	few: 2,
};

/**
 * Count distinct wound/injury mentions in free-form autopsy text.
 * Handles both clinical ("three lacerations to the scalp") and informal
 * ("slit on throat, scratch on thigh") descriptions.
 */
export function countWoundsHeuristic(text: string): number {
	if (!text) return 0;
	const lower = text.toLowerCase();

	// 1. Explicit numeric patterns: "two stab wounds", "3 lacerations", "multiple bruises"
	const injuryAlt = WOUND_INJURY_WORDS.join("|");
	let explicitCount = 0;
	const numericRe = new RegExp(
		`\\b(\\d+|${Object.keys(WOUND_NUMBER_WORDS).join("|")})\\s+\\w*\\s*(?:${injuryAlt})\\b`,
		"gi",
	);
	let m: RegExpExecArray | null;
	while ((m = numericRe.exec(lower)) !== null) {
		const token = m[1];
		const n = /^\d+$/.test(token)
			? parseInt(token, 10)
			: (WOUND_NUMBER_WORDS[token] ?? 1);
		explicitCount += n;
	}

	// 2. Segment-based count: split by common separators, tally segments that
	//    mention an injury word or a body part.
	const segments = lower
		.split(/[,;./\n]|\band\b|\bplus\b|\balso\b|\bthen\b/g)
		.map((s) => s.trim())
		.filter(Boolean);

	const injuryRes = WOUND_INJURY_WORDS.map(
		(w) => new RegExp(`\\b${w}\\b`, "i"),
	);
	const bodyRes = WOUND_BODY_PARTS.map((w) => new RegExp(`\\b${w}\\b`, "i"));

	let segmentCount = 0;
	for (const seg of segments) {
		const hasInjury = injuryRes.some((r) => r.test(seg));
		const hasBody = bodyRes.some((r) => r.test(seg));
		// Count if the segment mentions an injury term, OR mentions a body part
		// alongside any short descriptor (catches informal phrases).
		if (hasInjury || (hasBody && seg.length < 80)) segmentCount++;
	}

	return Math.max(explicitCount, segmentCount);
}

/**
 * Heuristic confidence score (0-100) based on what was actually extracted.
 * Used when the LLM returns 0 or an invalid confidence, so the UI never
 * renders "0%" for a call that did produce real output.
 */
export function computeConfidenceHeuristic(
	reportText: string,
	parsed: {
		causeOfDeath?: string;
		mannerOfDeath?: string;
		injuryPattern?: string;
		toxicologyFindings?: string;
	},
	woundsCount: number,
): number {
	const trimmed = (reportText ?? "").trim();
	if (trimmed.length === 0) return 5;

	// Baseline: reward plausibly-sized report input.
	let score = 15;
	if (trimmed.length >= 80) score += 10;
	if (trimmed.length >= 250) score += 10;
	if (trimmed.length >= 600) score += 10;

	// Reward extractions that actually named something.
	const cod = (parsed.causeOfDeath ?? "").toLowerCase();
	if (cod && !cod.includes("undetermined") && !cod.includes("pending"))
		score += 15;

	const manner = (parsed.mannerOfDeath ?? "").toUpperCase();
	if (manner && manner !== "UNDETERMINED") score += 10;

	if (woundsCount > 0) score += 8;

	const tox = (parsed.toxicologyFindings ?? "").toLowerCase();
	if (tox && !tox.includes("no significant") && tox.length > 10) score += 7;

	const injury = (parsed.injuryPattern ?? "").trim();
	if (injury.length > 20) score += 10;

	return Math.max(10, Math.min(90, Math.round(score)));
}


export async function analyzeAutopsyReport(
	input: AutopsyAnalysisInput,
): Promise<AutopsyAnalysisResult> {
	const {
		reportText,
		bodyTemperature,
		ambientTemperature,
		rigorMortisStage = 1,
		livorMortisState = "faint",
	} = input;

	// Calculate PMI from physical measurements (real math, not AI)
	let postmortemInterval = "";
	let timeOfDeathEstimate: string | undefined;

	if (bodyTemperature !== undefined && ambientTemperature !== undefined) {
		const tempResult = henssgeNomogram(bodyTemperature, ambientTemperature);
		const rigorRange = rigorMortisToHours(rigorMortisStage);
		const livorRange = livorMortisToHours(livorMortisState);
		const combined = combineTimeRanges([
			{ min: tempResult.range[0], max: tempResult.range[1] },
			rigorRange,
			livorRange,
		]);
		postmortemInterval = `${Math.round(combined.min)}–${Math.round(combined.max)} hours`;
		timeOfDeathEstimate = `Estimated ${Math.round(combined.min)}–${Math.round(combined.max)} hours prior to discovery`;
	} else {
		const rigorRange = rigorMortisToHours(rigorMortisStage);
		const livorRange = livorMortisToHours(livorMortisState);
		const combined = combineTimeRanges([rigorRange, livorRange]);
		postmortemInterval = `${Math.round(combined.min)}–${Math.round(combined.max)} hours (temperature data unavailable)`;
	}

	const systemPrompt = `You are a forensic pathology AI assistant for the KAVALAN investigative system. 
Analyze autopsy reports and extract structured forensic intelligence. 
Be precise, clinical, and evidence-based. Never speculate beyond what the report states.
Always respond with valid JSON only — no markdown, no explanation outside the JSON.`;

	const userMessage = `Analyze this autopsy report and return a JSON object with exactly these fields:
- causeOfDeath: string (precise medical cause, e.g. "Blunt force traumatic brain injury")
- mannerOfDeath: one of "HOMICIDE" | "SUICIDE" | "NATURAL" | "ACCIDENTAL" | "UNDETERMINED". Classify based on these signals:
   * HOMICIDE: defensive wounds, multiple impact points, ligature marks, evidence of struggle, third-party involvement, weapon use on victim, staged scene indicators.
   * SUICIDE: self-inflicted injuries, hesitation marks, weapon in decedent's hand, suicide note mentioned, single locus of injury consistent with self-infliction, tool-of-means within reach.
   * NATURAL: internal pathology (cardiac infarction, stroke, cancer, sepsis, ruptured aneurysm), no traumatic injuries, known medical history consistent with cause.
   * ACCIDENTAL: motor-vehicle impact with no foul play, unwitnessed fall, drowning without trauma, occupational injury, drug overdose with no indication of self-harm intent.
   * UNDETERMINED: only when the report genuinely lacks signals or presents ambiguity (e.g. decomposed remains, inconclusive pathology). Prefer the most probable classification when any discriminating signal is present — do not default to UNDETERMINED just because the report is short.
- injuryPattern: string (clinical description of wound distribution and what it indicates)
- toxicologyFindings: string (substances found and their significance, or "No significant findings")
- woundsCount: number (count every distinct injury site. Each wound or injury described in its own phrase or list item counts separately. "slit on throat, scratch on thigh" -> 2. "multiple lacerations across torso" -> at least 3. "single gunshot wound to chest" -> 1. Do not collapse multiple sites into one.)
- confidence: integer 1-100. Calibration: 1-20 for blank/near-empty reports, 21-40 for very brief or informal reports with minimal clinical content, 41-60 for reports with partial findings, 61-85 for detailed clinical reports with clear cause/manner, 86-100 only for complete formal autopsy reports. Never return 0.
- analysisNotes: string (key forensic observations, methodology notes, caveats)
- extractedKeywords: string[] (list of forensic terms found: injury types, substances, conditions)

AUTOPSY REPORT:
${reportText}

${bodyTemperature !== undefined ? `Body temperature at scene: ${bodyTemperature}°C, Ambient: ${ambientTemperature}°C` : ""}
${rigorMortisStage !== undefined ? `Rigor mortis stage: ${rigorMortisStage} (0=none, 1=early, 2=full, 3=resolving)` : ""}
${livorMortisState ? `Livor mortis state: ${livorMortisState}` : ""}

Respond with JSON only.`;

	try {
		const raw = await callClaude(
			systemPrompt,
			userMessage,
			1024,
			"autopsy_analysis",
		);
		// Strip markdown code fences if present
		const cleaned = raw
			.replace(/^```(?:json)?\n?/i, "")
			.replace(/\n?```$/i, "")
			.trim();
		const parsed = JSON.parse(cleaned);

		// If the model underestimates wounds (or returns 0), cross-check with
		// heuristic counter so informal reports still tally correctly.
		const heuristicWounds = countWoundsHeuristic(reportText);
		const woundsCount = Math.max(parsed.woundsCount ?? 0, heuristicWounds);

		// Confidence: trust the model when it returns a sensible value, but
		// never surface 0 — fall back to an extraction-completeness heuristic
		// so the UI communicates "partial" instead of "nothing".
		const rawConf =
			typeof parsed.confidence === "number" ? parsed.confidence : NaN;
		const heuristicConf = computeConfidenceHeuristic(
			reportText,
			parsed,
			woundsCount,
		);
		const confidence =
			rawConf >= 1 && rawConf <= 100
				? Math.round(Math.max(rawConf, Math.min(heuristicConf, rawConf + 25)))
				: heuristicConf;

		return {
			causeOfDeath: parsed.causeOfDeath ?? "Undetermined",
			mannerOfDeath: parsed.mannerOfDeath ?? "UNDETERMINED",
			postmortemInterval,
			injuryPattern: parsed.injuryPattern ?? "",
			toxicologyFindings:
				parsed.toxicologyFindings ?? "No significant findings",
			woundsCount,
			confidence,
			analysisNotes: parsed.analysisNotes ?? "",
			extractedKeywords: parsed.extractedKeywords ?? [],
			timeOfDeathEstimate,
		};
	} catch (err) {
		// Fallback to heuristic if Claude fails
		console.error("LLM autopsy analysis failed, using fallback:", err);
		return analyzeAutopsyReportFallback(
			input,
			postmortemInterval,
			timeOfDeathEstimate,
		);
	}
}

// ─── analyzeAutopsyReport fallback (keyword heuristic) ───────────────────────

function analyzeAutopsyReportFallback(
	input: AutopsyAnalysisInput,
	postmortemInterval: string,
	timeOfDeathEstimate?: string,
): AutopsyAnalysisResult {
	const { reportText } = input;
	const lower = reportText.toLowerCase();

	const keywords: string[] = [];
	const injuryTerms = [
		"blunt force",
		"laceration",
		"strangulation",
		"gunshot",
		"stabbing",
		"fracture",
		"contusion",
		"hematoma",
		"defensive wound",
		"subdural",
		"hemorrhage",
		"trauma",
	];
	for (const t of injuryTerms) if (lower.includes(t)) keywords.push(t);

	// Wider-spectrum manner classification. Assign points to each category
	// based on keyword presence and pick the highest; tie-break toward the
	// more decisive category (HOMICIDE > SUICIDE > ACCIDENTAL > NATURAL).
	const scores: Record<string, number> = {
		HOMICIDE: 0,
		SUICIDE: 0,
		NATURAL: 0,
		ACCIDENTAL: 0,
		UNDETERMINED: 0,
	};
	const has = (s: string) => lower.includes(s);
	if (has("defensive")) scores.HOMICIDE += 3;
	if (has("ligature") || has("strangulation")) scores.HOMICIDE += 2;
	if (has("gunshot") || has("gsw")) scores.HOMICIDE += 2;
	if (has("execution")) scores.HOMICIDE += 3;
	if (has("multiple wounds") || has("multiple stab") || has("stab wound"))
		scores.HOMICIDE += 2;
	if (has("staged") || has("homicide")) scores.HOMICIDE += 3;
	if (has("assault") || has("beating") || has("bludgeon")) scores.HOMICIDE += 2;

	if (has("self-inflicted") || has("self inflicted")) scores.SUICIDE += 4;
	if (has("hesitation")) scores.SUICIDE += 3;
	if (has("suicide note") || has("suicide")) scores.SUICIDE += 3;
	if (has("in decedent's hand") || has("in own hand")) scores.SUICIDE += 2;
	if (has("hanging") || has("noose")) scores.SUICIDE += 2;
	if (has("overdose") && has("intentional")) scores.SUICIDE += 3;

	if (has("cardiac") || has("myocardial") || has("infarction")) scores.NATURAL += 3;
	if (has("stroke") || has("cerebrovascular")) scores.NATURAL += 3;
	if (has("aneurysm") || has("sepsis") || has("pneumonia")) scores.NATURAL += 2;
	if (has("malignancy") || has("cancer") || has("metastatic")) scores.NATURAL += 2;
	if (has("natural disease") || has("known history")) scores.NATURAL += 2;

	if (has("motor vehicle") || has("collision") || has("traffic accident"))
		scores.ACCIDENTAL += 3;
	if (has("drowning") && !has("ligature")) scores.ACCIDENTAL += 2;
	if (has("fall") || has("fell from") || has("unwitnessed fall"))
		scores.ACCIDENTAL += 2;
	if (has("overdose") && !has("intentional")) scores.ACCIDENTAL += 2;
	if (has("occupational") || has("industrial accident")) scores.ACCIDENTAL += 2;
	if (has("accidental")) scores.ACCIDENTAL += 3;

	// Generic trauma without discriminators is weak HOMICIDE signal.
	if (
		(has("blunt") || has("sharp force") || has("fracture")) &&
		scores.HOMICIDE === 0 &&
		scores.SUICIDE === 0 &&
		scores.ACCIDENTAL === 0
	)
		scores.HOMICIDE += 1;

	const TIEBREAK: string[] = [
		"HOMICIDE",
		"SUICIDE",
		"ACCIDENTAL",
		"NATURAL",
		"UNDETERMINED",
	];
	let winner = "UNDETERMINED";
	let best = 0;
	for (const k of TIEBREAK) {
		if (scores[k] > best) {
			best = scores[k];
			winner = k;
		}
	}
	const manner = best === 0 ? "UNDETERMINED" : winner;

	const cause = lower.includes("gunshot")
		? "Gunshot wound — projectile trauma"
		: lower.includes("strangulation") || lower.includes("ligature")
			? "Asphyxia due to ligature strangulation"
			: lower.includes("blunt")
				? "Blunt force traumatic brain injury"
				: "Cause pending further analysis";

	return {
		causeOfDeath: cause,
		mannerOfDeath: manner,
		postmortemInterval,
		injuryPattern: keywords.join("; ") || "Pattern analysis pending",
		toxicologyFindings:
			lower.includes("ethanol") || lower.includes("benzodiazepine")
				? "Substances detected — full panel pending"
				: "No significant findings",
		woundsCount: Math.max(1, countWoundsHeuristic(reportText), keywords.length),
		confidence: 45,
		analysisNotes:
			"Fallback heuristic analysis — LLM inference unavailable.",
		extractedKeywords: keywords,
		timeOfDeathEstimate,
	};
}

// ─── correlateDigitalEvidence — real Claude intelligence ─────────────────────

export async function correlateDigitalEvidence(
	input: DigitalCorrelationInput,
): Promise<DigitalCorrelationResult> {
	const { events } = input;

	if (!events || events.length === 0) {
		return { anomalies: [], timeline: [], patterns: [], riskContribution: 0 };
	}

	const sorted = [...events].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);

	const systemPrompt = `You are a forensic digital intelligence analyst for the KAVALAN system.
Analyze digital evidence timelines and identify investigative anomalies, suspicious patterns, and correlations.
Be precise and evidence-based. Think like a detective. Respond with valid JSON only.`;

	const eventsText = sorted
		.map(
			(e, i) =>
				`[${i + 1}] ${e.timestamp} | ${e.sourceType} | Subject: ${e.subject} | Location: ${e.location}\n    ${e.description}`,
		)
		.join("\n");

	const userMessage = `Analyze this digital evidence timeline for a criminal investigation and return a JSON object with:

- anomalies: array of objects with:
  - type: string (e.g. "TEMPORAL_GAP", "LOCATION_CONTRADICTION", "DEVICE_SILENCE", "SUSPICIOUS_ACTIVITY", "FINANCIAL_ANOMALY", "COORDINATED_ACTION")
  - severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"  
  - description: string (detailed investigative explanation of why this is suspicious)
  - timestamps: string[] (relevant ISO timestamps from the evidence)

- patterns: array of objects with:
  - pattern: string (behavioral or evidential pattern identified)
  - confidence: number 0-100
  - subjects: string[] (subjects involved)

- riskContribution: number 0-100 (how much this digital evidence raises overall case risk)

- summary: string (2-3 sentence investigative narrative of what the digital evidence suggests happened)

DIGITAL EVIDENCE TIMELINE:
${eventsText}

Focus on: timeline gaps, impossible movements, device going offline at critical times, financial activity near incident, coordinated behavior across subjects, pre-meditation indicators.
Respond with JSON only.`;

	try {
		const raw = await callClaude(
			systemPrompt,
			userMessage,
			1500,
			"digital_correlation",
		);
		const cleaned = raw
			.replace(/^```(?:json)?\n?/i, "")
			.replace(/\n?```$/i, "")
			.trim();
		const parsed = JSON.parse(cleaned);

		const timeline = sorted.map((ev) => ({
			timestamp: ev.timestamp,
			event: ev.description,
			source: `${ev.sourceType} — ${ev.subject}`,
			significance: (parsed.anomalies ?? []).some(
				(a: { timestamps: string[] }) =>
					a.timestamps.some(
						(t: string) =>
							t === ev.timestamp || ev.timestamp.startsWith(t.substring(0, 16)),
					),
			)
				? "FLAGGED"
				: "NORMAL",
		}));

		return {
			anomalies: parsed.anomalies ?? [],
			timeline,
			patterns: parsed.patterns ?? [],
			riskContribution: parsed.riskContribution ?? 0,
		};
	} catch (err) {
		console.error("LLM correlation failed, using fallback:", err);
		return correlateDigitalEvidenceFallback(input);
	}
}

// ─── correlateDigitalEvidence fallback ───────────────────────────────────────

function correlateDigitalEvidenceFallback(
	input: DigitalCorrelationInput,
): DigitalCorrelationResult {
	const { events } = input;
	const sorted = [...events].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);
	const anomalies: DigitalCorrelationResult["anomalies"] = [];
	const patterns: Array<{
		pattern: string;
		confidence: number;
		subjects: string[];
	}> = [];

	// 1. Temporal gaps per subject
	const bySubject = new Map<string, typeof sorted>();
	for (const ev of sorted) {
		const key = ev.subject || "unknown";
		const arr = bySubject.get(key) ?? [];
		arr.push(ev);
		bySubject.set(key, arr);
	}
	for (const [subject, subjectEvents] of bySubject) {
		for (let i = 1; i < subjectEvents.length; i++) {
			const gapHours =
				(new Date(subjectEvents[i].timestamp).getTime() -
					new Date(subjectEvents[i - 1].timestamp).getTime()) /
				3600000;
			if (gapHours > 2) {
				anomalies.push({
					type: "TEMPORAL_GAP",
					severity: gapHours > 8 ? "HIGH" : "MEDIUM",
					description: `${gapHours.toFixed(1)}h gap in activity for subject "${subject}"`,
					timestamps: [
						subjectEvents[i - 1].timestamp,
						subjectEvents[i].timestamp,
					],
				});
			}
		}
	}

	// 2. Event bursts (>=3 events within 30 min)
	for (let i = 0; i < sorted.length; i++) {
		const windowStart = new Date(sorted[i].timestamp).getTime();
		let count = 1;
		const ts: string[] = [sorted[i].timestamp];
		for (let j = i + 1; j < sorted.length; j++) {
			const delta =
				(new Date(sorted[j].timestamp).getTime() - windowStart) / 60000;
			if (delta <= 30) {
				count++;
				ts.push(sorted[j].timestamp);
			} else break;
		}
		if (count >= 3) {
			anomalies.push({
				type: "COORDINATED_ACTION",
				severity: count >= 5 ? "HIGH" : "MEDIUM",
				description: `${count} digital events within a 30-minute window — possible coordinated activity.`,
				timestamps: ts,
			});
			i += count - 1;
		}
	}

	// 3. High-anomaly flagged records from ingestion metadata
	const highAnomalyEvents = sorted.filter(
		(e) => typeof e.anomalyScore === "number" && e.anomalyScore > 70,
	);
	if (highAnomalyEvents.length > 0) {
		anomalies.push({
			type: "SUSPICIOUS_ACTIVITY",
			severity: highAnomalyEvents.some((e) => (e.anomalyScore ?? 0) >= 90)
				? "CRITICAL"
				: "HIGH",
			description: `${highAnomalyEvents.length} record${
				highAnomalyEvents.length === 1 ? "" : "s"
			} flagged with anomaly score > 70 at ingestion.`,
			timestamps: highAnomalyEvents.map((e) => e.timestamp),
		});
	}

	// 4. Source diversity pattern
	const types = new Set(sorted.map((e) => e.sourceType));
	if (types.size >= 3) {
		patterns.push({
			pattern: `Multi-source digital footprint across ${types.size} channels (${Array.from(
				types,
			).join(", ")})`,
			confidence: Math.min(90, 50 + types.size * 10),
			subjects: Array.from(new Set(sorted.map((e) => e.subject).filter(Boolean))),
		});
	}

	// 5. Recurring subjects pattern
	const subjectCounts = new Map<string, number>();
	for (const e of sorted) {
		if (!e.subject) continue;
		subjectCounts.set(e.subject, (subjectCounts.get(e.subject) ?? 0) + 1);
	}
	const repeated = Array.from(subjectCounts.entries())
		.filter(([, n]) => n >= 2)
		.sort((a, b) => b[1] - a[1]);
	if (repeated.length > 0) {
		patterns.push({
			pattern: `Repeated subject${repeated.length === 1 ? "" : "s"}: ${repeated
				.slice(0, 3)
				.map(([s, n]) => `${s} (${n})`)
				.join(", ")}`,
			confidence: 70,
			subjects: repeated.map(([s]) => s),
		});
	}

	// 6. Night-time activity cluster (22:00–04:00)
	const nightEvents = sorted.filter((e) => {
		const hour = new Date(e.timestamp).getUTCHours();
		return hour >= 22 || hour < 4;
	});
	if (nightEvents.length >= 2 && nightEvents.length / sorted.length > 0.4) {
		patterns.push({
			pattern: `Concentrated overnight activity (${nightEvents.length}/${sorted.length} events between 22:00–04:00 UTC)`,
			confidence: 65,
			subjects: Array.from(new Set(nightEvents.map((e) => e.subject))),
		});
	}

	// Risk contribution: scales with anomaly count and severity
	let risk = 0;
	for (const a of anomalies) {
		risk +=
			a.severity === "CRITICAL"
				? 25
				: a.severity === "HIGH"
					? 15
					: a.severity === "MEDIUM"
						? 8
						: 3;
	}
	risk = Math.min(100, risk);

	return {
		anomalies,
		timeline: sorted.map((ev) => ({
			timestamp: ev.timestamp,
			event: ev.description,
			source: `${ev.sourceType} — ${ev.subject}`,
			significance:
				anomalies.some((a) => a.timestamps.includes(ev.timestamp))
					? "FLAGGED"
					: "NORMAL",
		})),
		patterns,
		riskContribution: risk,
	};
}

// ─── estimateTod — Henssge nomogram (real forensic math) ─────────────────────

export function estimateTod(input: TodInput): TodResult {
	const {
		bodyTemp,
		ambientTemp,
		rigorMortisStage,
		livorMortisState,
		lastSeenAlive,
		weight = 70,
	} = input;
	const now = new Date().toISOString();

	const tempEstimate = henssgeNomogram(bodyTemp, ambientTemp, weight);
	const rigorRange = rigorMortisToHours(rigorMortisStage);
	const livorRange = livorMortisToHours(livorMortisState);
	const combined = combineTimeRanges([
		{ min: tempEstimate.range[0], max: tempEstimate.range[1] },
		rigorRange,
		livorRange,
	]);

	let finalMin = combined.min;
	let finalMax = combined.max;
	let lastSeenNote = "";
	let conflict = false;

	if (lastSeenAlive) {
		const hoursSinceLastSeen =
			(new Date().getTime() - new Date(lastSeenAlive).getTime()) / 3600000;
		if (Number.isFinite(hoursSinceLastSeen) && hoursSinceLastSeen >= 0) {
			if (hoursSinceLastSeen < finalMin) {
				// Contradiction: post-mortem signs imply death *before* the
				// reported last-seen-alive. Flag it, widen window around the LSA.
				conflict = true;
				lastSeenNote =
					` Conflict: forensic signs suggest TOD earlier than last-seen-alive ` +
					`(${lastSeenAlive}). Last-seen-alive likely inaccurate or the ` +
					`rigor/livor observations need re-evaluation.`;
				finalMin = Math.max(0, hoursSinceLastSeen - 2);
				finalMax = hoursSinceLastSeen;
			} else if (hoursSinceLastSeen < finalMax) {
				// Normal case: LSA tightens the upper bound.
				finalMax = hoursSinceLastSeen;
				lastSeenNote =
					` Upper bound constrained by last-seen-alive (${lastSeenAlive}).`;
			}
		}
	}

	// Guarantee a non-degenerate window. If the constraints collapsed to a
	// single point (or inverted), expand outward by a minimum ±1h band and
	// penalise confidence — a zero-width TOD estimate is physically implausible.
	let collapsed = false;
	const MIN_SPREAD = 2; // hours
	if (finalMax - finalMin < MIN_SPREAD) {
		collapsed = true;
		const mid = (finalMin + finalMax) / 2;
		finalMin = Math.max(0, mid - MIN_SPREAD / 2);
		finalMax = mid + MIN_SPREAD / 2;
	}

	const centralHours = (finalMin + finalMax) / 2;
	let confidenceLevel = 70;
	const rangeWidth = finalMax - finalMin;
	// Genuinely narrow (but not collapsed) windows still signal confidence.
	if (!collapsed && rangeWidth < 4) confidenceLevel += 15;
	else if (!collapsed && rangeWidth < 8) confidenceLevel += 8;
	else if (rangeWidth > 20) confidenceLevel -= 15;
	if (bodyTemp > ambientTemp + 2) confidenceLevel += 5;
	if (lastSeenAlive && !conflict) confidenceLevel += 5;
	if (collapsed) confidenceLevel -= 20;
	if (conflict) confidenceLevel -= 20;
	confidenceLevel = Math.min(95, Math.max(25, confidenceLevel));

	const methodology =
		`Henssge nomogram: body ${bodyTemp}°C, ambient ${ambientTemp}°C (${weight}kg). ` +
		`k=${(0.05 * Math.sqrt(70 / weight)).toFixed(3)}/hr. Temp PMI: ${tempEstimate.hours}h ` +
		`(${tempEstimate.range[0]}-${tempEstimate.range[1]}h). ` +
		`Rigor stage ${rigorMortisStage} -> ${rigorRange.min}-${rigorRange.max}h. ` +
		`Livor (${livorMortisState}) -> ${livorRange.min}-${livorRange.max}h. ` +
		`Intersected: ${Math.round(finalMin)}-${Math.round(finalMax)}h PMI.` +
		(collapsed
			? ` (Expanded from a collapsed window; treat as low confidence.)`
			: "") +
		lastSeenNote;

	return {
		estimatedTodEarliest: hoursToIso(now, finalMax),
		estimatedTodLatest: hoursToIso(now, finalMin),
		centralEstimate: hoursToIso(now, centralHours),
		confidenceLevel,
		methodology,
		notes:
			`PMI: ${Math.round(finalMin)}-${Math.round(finalMax)}h. Central: ${Math.round(centralHours)}h ago. ` +
			(lastSeenAlive ? `Last seen: ${lastSeenAlive}. ` : "") +
			`Confidence: ${confidenceLevel}%.` +
			(conflict
				? " Signals conflict with last-seen-alive."
				: collapsed
					? " Window collapsed; widened to 2h minimum."
					: "") +
			` Environmental factors may shift +/-20%.`,
		pmhHours: {
			min: Math.round(finalMin * 10) / 10,
			max: Math.round(finalMax * 10) / 10,
			central: Math.round(centralHours * 10) / 10,
		},
	};
}

// ─── reconstructTimeline — narrative event reconstruction ────────────────────

export interface TimelineReconstructionInput {
	caseTitle: string;
	caseDescription: string;
	dateOfIncident: string;
	victimName: string;
	location: string;
	autopsy?: {
		causeOfDeath: string;
		mannerOfDeath: string;
		postmortemInterval: string;
		injuryPattern: string;
		analyzedAt: string;
	};
	tod?: {
		estimatedTodEarliest: string;
		estimatedTodLatest: string;
		centralEstimate?: string;
		methodology: string;
	};
	digitalEvents: Array<{
		sourceType: string;
		sourceName?: string;
		timestamp: string;
		location: string;
		subject: string;
		description: string;
		anomalyScore?: number;
	}>;
	physicalEvidence: Array<{
		catalogRef: string;
		type: string;
		description: string;
		collectedAt: string;
		location: string;
		analyst: string;
	}>;
	priorReviews?: {
		confirmed: string[];
		rejected: string[];
	};
}

export interface TimelineReconstructionEvent {
	time: string;
	title: string;
	description: string;
	confidence: number;
	sourceType: "DIGITAL" | "AUTOPSY" | "TOD" | "EVIDENCE" | "INFERRED";
	evidenceRef?: string;
}

export interface TimelineReconstructionResult {
	summary: string;
	events: TimelineReconstructionEvent[];
	inconsistencies: Array<{ description: string; severity: string }>;
	confidence: number;
}

export async function reconstructTimeline(
	input: TimelineReconstructionInput,
): Promise<TimelineReconstructionResult> {
	const sortedDigital = [...input.digitalEvents].sort(
		(a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
	);
	const sortedEvidence = [...input.physicalEvidence].sort(
		(a, b) => new Date(a.collectedAt).getTime() - new Date(b.collectedAt).getTime(),
	);

	if (
		sortedDigital.length === 0 &&
		sortedEvidence.length === 0 &&
		!input.autopsy &&
		!input.tod
	) {
		return {
			summary:
				"Insufficient evidence to reconstruct a timeline. Add catalogued evidence, digital evidence, an autopsy analysis, or a time-of-death estimate to generate an event reconstruction.",
			events: [],
			inconsistencies: [],
			confidence: 0,
		};
	}

	const systemPrompt = `You are a forensic timeline reconstruction analyst for the KAVALAN investigative system.
Given case details, autopsy findings, a time-of-death estimate, catalogued physical/biological/
forensic evidence, and digital evidence records, synthesize the most probable chronological
sequence of events. Combine confirmed evidence with reasonable forensic inference, clearly
distinguishing the two. Flag any evidence that contradicts other evidence (e.g. a digital
record placing the subject somewhere the TOD window rules out). Note that catalogued evidence
timestamps (collectedAt) reflect when it was recovered/logged, not necessarily when the
underlying event occurred — use the item's description to judge where it belongs in the
actual event sequence, not just its collection time. Be precise and evidence-based — do not
invent specific facts not supported by the input, but you may infer plausible connective
events (e.g. "subject likely traveled between location A and B in this gap") and mark them
as inferred with lower confidence. Respond with valid JSON only — no markdown, no explanation
outside the JSON.`;

	const digitalText = sortedDigital.length
		? sortedDigital
				.map(
					(e, i) =>
						`[${i + 1}] ${e.timestamp} | ${e.sourceType}${e.sourceName ? ` (${e.sourceName})` : ""} | Subject: ${e.subject} | Location: ${e.location}\n    ${e.description}${e.anomalyScore ? ` [anomaly score: ${e.anomalyScore}]` : ""}`,
				)
				.join("\n")
		: "No digital evidence on file.";

	const evidenceText = sortedEvidence.length
		? sortedEvidence
				.map(
					(e, i) =>
						`[${i + 1}] ${e.catalogRef} | ${e.type} | Collected: ${e.collectedAt} | Location: ${e.location} | Analyst: ${e.analyst}\n    ${e.description}`,
				)
				.join("\n")
		: "No catalogued physical/biological/forensic evidence on file.";

	const userMessage = `Reconstruct the probable event timeline for this case and return a JSON object with exactly these fields:

- summary: string (3-5 sentence narrative of what most likely happened, in chronological order)
- events: array of objects, sorted chronologically, each with:
  - time: string (ISO timestamp if known precisely, otherwise a descriptive estimate like "approx. 21:30" or a range)
  - title: string (short label, e.g. "Subject enters premises")
  - description: string (1-2 sentence detail)
  - confidence: integer 0-100 (100 = directly evidenced, lower = inferred)
  - sourceType: one of "DIGITAL" | "AUTOPSY" | "TOD" | "EVIDENCE" | "INFERRED" (EVIDENCE = catalogued physical/biological/forensic evidence; INFERRED = a gap-filling event not directly evidenced by any single record)
  - evidenceRef: string or null (which piece of evidence supports this, if any — e.g. "CCTV — Main Gate Cam", "Autopsy PMI window", or a catalog ref like "EVD-0084-002")
- inconsistencies: array of objects with:
  - description: string (what contradicts what, and why it matters)
  - severity: "LOW" | "MEDIUM" | "HIGH"
- confidence: integer 0-100 (overall confidence in this reconstruction given evidence completeness)

CASE: ${input.caseTitle}
Victim: ${input.victimName}
Location: ${input.location}
Date of incident: ${input.dateOfIncident}
Description: ${input.caseDescription}

${
	input.priorReviews &&
	(input.priorReviews.confirmed.length > 0 || input.priorReviews.rejected.length > 0)
		? `INVESTIGATOR REVIEW OF A PRIOR RECONSTRUCTION (treat as ground truth):
Confirmed accurate — keep these or clearly equivalent events, do not contradict them:
${input.priorReviews.confirmed.length ? input.priorReviews.confirmed.map((e) => `- ${e}`).join("\n") : "(none)"}
Rejected as inaccurate — do not reintroduce these unless new evidence now supports them:
${input.priorReviews.rejected.length ? input.priorReviews.rejected.map((e) => `- ${e}`).join("\n") : "(none)"}
`
		: ""
}

${
	input.autopsy
		? `AUTOPSY FINDINGS:
Cause of death: ${input.autopsy.causeOfDeath}
Manner of death: ${input.autopsy.mannerOfDeath}
Postmortem interval: ${input.autopsy.postmortemInterval}
Injury pattern: ${input.autopsy.injuryPattern}
Analyzed at: ${input.autopsy.analyzedAt}`
		: "AUTOPSY: not yet on file."
}

${
	input.tod
		? `TIME OF DEATH ESTIMATE:
Window: ${input.tod.estimatedTodEarliest} to ${input.tod.estimatedTodLatest}
Central estimate: ${input.tod.centralEstimate ?? "n/a"}
Methodology: ${input.tod.methodology}`
		: "TIME OF DEATH: not yet estimated."
}

CATALOGUED EVIDENCE (physical/biological/forensic/testimonial, by collection time):
${evidenceText}

DIGITAL EVIDENCE (chronological):
${digitalText}

Respond with JSON only.`;

	try {
		const raw = await callClaude(
			systemPrompt,
			userMessage,
			2048,
			"timeline_reconstruction",
		);
		const cleaned = raw
			.replace(/^```(?:json)?\n?/i, "")
			.replace(/\n?```$/i, "")
			.trim();
		const parsed = JSON.parse(cleaned);

		const events: TimelineReconstructionEvent[] = Array.isArray(parsed.events)
			? parsed.events.map((e: Record<string, unknown>) => ({
					time: String(e.time ?? ""),
					title: String(e.title ?? ""),
					description: String(e.description ?? ""),
					confidence:
						typeof e.confidence === "number"
							? Math.max(0, Math.min(100, e.confidence))
							: 50,
					sourceType: (["DIGITAL", "AUTOPSY", "TOD", "EVIDENCE", "INFERRED"].includes(
						String(e.sourceType),
					)
						? e.sourceType
						: "INFERRED") as TimelineReconstructionEvent["sourceType"],
					evidenceRef: e.evidenceRef ? String(e.evidenceRef) : undefined,
				}))
			: [];

		return {
			summary: parsed.summary ?? "",
			events,
			inconsistencies: Array.isArray(parsed.inconsistencies)
				? parsed.inconsistencies
				: [],
			confidence:
				typeof parsed.confidence === "number"
					? Math.max(0, Math.min(100, parsed.confidence))
					: 50,
		};
	} catch (err) {
		console.error("LLM timeline reconstruction failed, using fallback:", err);
		return reconstructTimelineFallback(input, sortedDigital, sortedEvidence);
	}
}

// ─── reconstructTimeline fallback (deterministic, evidence-only) ─────────────

function reconstructTimelineFallback(
	input: TimelineReconstructionInput,
	sortedDigital: TimelineReconstructionInput["digitalEvents"],
	sortedEvidence: TimelineReconstructionInput["physicalEvidence"],
): TimelineReconstructionResult {
	const events: TimelineReconstructionEvent[] = [];

	for (const e of sortedDigital) {
		events.push({
			time: e.timestamp,
			title: `${e.sourceType}${e.sourceName ? ` — ${e.sourceName}` : ""}`,
			description: e.description,
			confidence: e.anomalyScore && e.anomalyScore > 70 ? 60 : 80,
			sourceType: "DIGITAL",
			evidenceRef: `${e.sourceType} — ${e.subject}`,
		});
	}

	for (const e of sortedEvidence) {
		events.push({
			time: e.collectedAt,
			title: `${e.type} evidence catalogued: ${e.catalogRef}`,
			description: e.description,
			confidence: 55,
			sourceType: "EVIDENCE",
			evidenceRef: e.catalogRef,
		});
	}

	if (input.tod) {
		events.push({
			time: input.tod.centralEstimate ?? input.tod.estimatedTodEarliest,
			title: "Estimated time of death",
			description: `Henssge-based estimate places time of death between ${input.tod.estimatedTodEarliest} and ${input.tod.estimatedTodLatest}.`,
			confidence: 65,
			sourceType: "TOD",
			evidenceRef: "TOD estimate",
		});
	}

	if (input.autopsy) {
		events.push({
			time: input.autopsy.analyzedAt,
			title: `Cause of death: ${input.autopsy.causeOfDeath}`,
			description: input.autopsy.injuryPattern || input.autopsy.mannerOfDeath,
			confidence: 70,
			sourceType: "AUTOPSY",
			evidenceRef: "Autopsy report",
		});
	}

	events.sort((a, b) => {
		const ta = new Date(a.time).getTime();
		const tb = new Date(b.time).getTime();
		if (Number.isNaN(ta) || Number.isNaN(tb)) return 0;
		return ta - tb;
	});

	const inconsistencies: Array<{ description: string; severity: string }> = [];
	if (input.tod && sortedDigital.length > 0) {
		const todEarliest = new Date(input.tod.estimatedTodEarliest).getTime();
		const todLatest = new Date(input.tod.estimatedTodLatest).getTime();
		const afterDeath = sortedDigital.filter((e) => {
			const t = new Date(e.timestamp).getTime();
			return Number.isFinite(t) && t > todLatest;
		});
		if (afterDeath.length > 0) {
			inconsistencies.push({
				description: `${afterDeath.length} digital record(s) timestamped after the estimated TOD window — verify device/account activity wasn't automated or accessed by a third party.`,
				severity: "MEDIUM",
			});
		}
	}

	return {
		summary: `Deterministic reconstruction from ${sortedDigital.length} digital record(s)${input.autopsy ? ", autopsy findings," : ""}${input.tod ? " and a TOD estimate" : ""}. This is a fallback ordering by timestamp — AI narrative synthesis was unavailable.`,
		events,
		inconsistencies,
		confidence: events.length > 0 ? 40 : 0,
	};
}

// ─── calculateRiskScore — deterministic formula ───────────────────────────────

export function calculateRiskScore(input: RiskScoreInput): RiskScoreResult {
	const {
		evidenceCount,
		suspectCount,
		digitalAnomalyCount,
		hasAutopsy,
		hasTodEstimate,
		mannerOfDeath,
		openTimelinGaps,
		caseAgeHours,
	} = input;

	const factors: RiskScoreResult["factors"] = [];

	const evidenceScore = Math.min(20, Math.round(Math.log1p(evidenceCount) * 6));
	factors.push({
		label: "Evidence Volume",
		score: evidenceScore,
		weight: 20,
		description: `${evidenceCount} item(s) catalogued.`,
	});

	const suspectScore = Math.min(20, Math.round(suspectCount * 4));
	factors.push({
		label: "Suspect Density",
		score: suspectScore,
		weight: 20,
		description: `${suspectCount} suspect(s) identified.`,
	});

	const digitalScore = Math.min(20, Math.round(digitalAnomalyCount * 5));
	factors.push({
		label: "Digital Anomalies",
		score: digitalScore,
		weight: 20,
		description: `${digitalAnomalyCount} anomaly/anomalies flagged.`,
	});

	const forensicInverse =
		20 - ((hasAutopsy ? 10 : 0) + (hasTodEstimate ? 10 : 0));
	factors.push({
		label: "Forensic Incompleteness",
		score: forensicInverse,
		weight: 20,
		description: `Autopsy: ${hasAutopsy ? "complete" : "pending"}. TOD: ${hasTodEstimate ? "complete" : "pending"}.`,
	});

	const urgencyScore = Math.min(
		20,
		Math.round(Math.max(0, 20 - (caseAgeHours / 720) * 20)),
	);
	factors.push({
		label: "Case Urgency",
		score: urgencyScore,
		weight: 20,
		description: `Case is ${Math.round(caseAgeHours)}h old.`,
	});

	const overall = factors.reduce((s, f) => s + f.score, 0);
	const tier: RiskLevel =
		overall >= 70
			? "CRITICAL"
			: overall >= 50
				? "HIGH"
				: overall >= 30
					? "MEDIUM"
					: "LOW";

	const anomalies: string[] = [];
	if (!hasAutopsy) anomalies.push("No autopsy on file");
	if (!hasTodEstimate) anomalies.push("TOD not estimated");
	if (openTimelinGaps > 2) anomalies.push(`${openTimelinGaps} timeline gaps`);
	if (digitalAnomalyCount >= 3)
		anomalies.push(
			"Multiple digital anomalies — possible coordinated concealment",
		);
	if (mannerOfDeath === "HOMICIDE")
		anomalies.push("Homicide confirmed — escalated priority");
	if (suspectCount === 0) anomalies.push("No suspects identified");
	if (caseAgeHours < 24)
		anomalies.push("Scene within 24h — time-critical evidence window");

	const recommendations: string[] = [];
	if (!hasAutopsy) recommendations.push("Commission autopsy immediately");
	if (!hasTodEstimate)
		recommendations.push("Submit temperature data for TOD analysis");
	if (digitalAnomalyCount >= 2)
		recommendations.push("Escalate digital forensics review");
	if (mannerOfDeath === "HOMICIDE" && suspectCount === 0)
		recommendations.push("Expedite CCTV and witness review");
	if (tier === "CRITICAL")
		recommendations.push("Request dedicated task force resources");

	return { overall, tier, factors, anomalies, recommendations };
}
