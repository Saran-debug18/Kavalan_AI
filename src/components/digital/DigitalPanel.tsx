"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
	Camera,
	Phone,
	MapPin,
	DollarSign,
	Share2,
	Mail,
	Globe,
} from "lucide-react";
import type { DigitalEvidence, DigitalSourceType } from "@/types";
import { formatTimestamp } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useToast } from "@/components/ui/Toast";

interface DigitalPanelProps {
	caseId: string;
	digitalEvidence: DigitalEvidence[];
	onRefresh?: () => void;
}

interface CorrelationResult {
	anomalies: {
		severity: string;
		type: string;
		description: string;
		timestamps: string[];
	}[];
	patterns: { label: string; confidence: number }[];
	digitalRisk: number;
	summary?: string;
	eventCount?: number;
}

function SourceIcon({ type }: { type: DigitalSourceType }) {
	const props = { size: 14, strokeWidth: 1.5, className: "inline-block" };
	switch (type) {
		case "CCTV":
			return <Camera {...props} />;
		case "MOBILE":
			return <Phone {...props} />;
		case "GPS":
			return <MapPin {...props} />;
		case "FINANCIAL":
			return <DollarSign {...props} />;
		case "SOCIAL":
			return <Share2 {...props} />;
		case "EMAIL":
			return <Mail {...props} />;
		case "BROWSER":
			return <Globe {...props} />;
		default:
			return null;
	}
}

function anomalyColor(score: number): string {
	if (score > 70) return "var(--crimson)";
	if (score >= 40) return "var(--amber)";
	return "var(--sage)";
}

function anomalyTextClass(score: number): string {
	if (score > 70) return "text-crimson";
	if (score >= 40) return "text-amber";
	return "text-sage";
}

function severityVariant(
	severity: string,
): "crimson" | "amber" | "sage" | "dim" {
	const s = severity.toUpperCase();
	if (s === "HIGH" || s === "CRITICAL") return "crimson";
	if (s === "MEDIUM") return "amber";
	if (s === "LOW") return "sage";
	return "dim";
}

function groupByDay(
	evts: DigitalEvidence[],
): { date: string; items: DigitalEvidence[] }[] {
	const map = new Map<string, DigitalEvidence[]>();
	for (const e of evts) {
		const d = e.timestamp ? e.timestamp.slice(0, 10) : "unknown";
		const arr = map.get(d) ?? [];
		arr.push(e);
		map.set(d, arr);
	}
	return Array.from(map.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([date, items]) => ({ date, items }));
}

export function DigitalPanel({ caseId, digitalEvidence, onRefresh }: DigitalPanelProps) {
	const toast = useToast();
	const [correlating, setCorrelating] = useState(false);
	const [correlationError, setCorrelationError] = useState<string | null>(null);
	const [correlationResult, setCorrelationResult] =
		useState<CorrelationResult | null>(null);

	// ─── Add-evidence form state ──────────────────────────────────────────────
	const [mode, setMode] = useState<"none" | "single" | "csv" | "image">("none");
	const [adding, setAdding] = useState(false);
	const [addError, setAddError] = useState<string | null>(null);
	const [addStatus, setAddStatus] = useState<string | null>(null);
	const [form, setForm] = useState({
		sourceType: "CCTV" as DigitalSourceType,
		sourceName: "",
		timestamp: "",
		location: "",
		subject: "",
		description: "",
		confidence: "0.75",
		tags: "",
	});
	const [csv, setCsv] = useState("");
	const [imageFile, setImageFile] = useState<File | null>(null);
	const [imageHint, setImageHint] = useState("");

	const CSV_TEMPLATE =
		"sourceType,sourceName,timestamp,location,subject,description,confidence,tags\n" +
		"CCTV,Main Gate Cam,2026-05-09T21:14:00Z,Main Gate,Unknown Male,Subject loiters near entrance for 4 min,0.82,loitering;unidentified\n" +
		"MOBILE,Victim iPhone,2026-05-09T22:05:00Z,14 Rosewood Ave,Eleanor Voss,Last outgoing call before incident,0.9,last-contact";

	async function submitSingle() {
		if (!form.sourceName.trim() || !form.timestamp.trim()) {
			setAddError("sourceName and timestamp are required.");
			return;
		}
		setAdding(true);
		setAddError(null);
		setAddStatus(null);
		try {
			// datetime-local → ISO with timezone
			const iso = new Date(form.timestamp).toISOString();
			const res = await fetch(`/api/cases/${caseId}/digital`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...form,
					timestamp: iso,
					confidence: parseFloat(form.confidence) || 0.5,
				}),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			setAddStatus(`Added ${data.inserted} record.`);
			toast.success("Digital evidence record added.");
			setForm({
				sourceType: "CCTV",
				sourceName: "",
				timestamp: "",
				location: "",
				subject: "",
				description: "",
				confidence: "0.75",
				tags: "",
			});
			onRefresh?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setAddError(message);
			toast.error(`Failed to add record: ${message}`);
		} finally {
			setAdding(false);
		}
	}

	async function submitCsv() {
		if (!csv.trim()) {
			setAddError("Paste CSV content first.");
			return;
		}
		setAdding(true);
		setAddError(null);
		setAddStatus(null);
		try {
			const res = await fetch(`/api/cases/${caseId}/digital`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ csv }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			setAddStatus(
				`Inserted ${data.inserted} record(s)` +
					(data.rejected?.length ? `, rejected ${data.rejected.length}.` : "."),
			);
			toast.success(`Imported ${data.inserted} digital evidence record(s).`);
			setCsv("");
			onRefresh?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setAddError(message);
			toast.error(`CSV import failed: ${message}`);
		} finally {
			setAdding(false);
		}
	}

	async function handleCsvFile(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0];
		if (!f) return;
		try {
			const text = await f.text();
			setCsv(text);
			setAddStatus(`Loaded ${f.name} (${Math.round(f.size / 1024)} KB). Click Import.`);
			setAddError(null);
		} catch (err) {
			setAddError(err instanceof Error ? err.message : "Could not read file");
		} finally {
			e.target.value = "";
		}
	}

	async function submitImage() {
		if (!imageFile) {
			setAddError("Choose an image file first.");
			return;
		}
		setAdding(true);
		setAddError(null);
		setAddStatus(null);
		try {
			const fd = new FormData();
			fd.append("image", imageFile);
			if (imageHint) fd.append("hint", imageHint);

			const res = await fetch(`/api/cases/${caseId}/digital/extract-image`, {
				method: "POST",
				body: fd,
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			if (data.inserted > 0) {
				setAddStatus(
					`Extracted ${data.extracted}, inserted ${data.inserted}.` +
						(data.summary ? ` ${data.summary}` : ""),
				);
				toast.success(`Extracted ${data.inserted} record(s) from image.`);
				onRefresh?.();
			} else {
				const message = data.summary
					? `No events extracted. Reason: ${data.summary}`
					: "No events could be extracted from this image.";
				setAddError(message);
				toast.error(message);
			}
			setImageFile(null);
			setImageHint("");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setAddError(message);
			toast.error(`Image extraction failed: ${message}`);
		} finally {
			setAdding(false);
		}
	}

	const sortedEvidence = useMemo(
		() =>
			[...digitalEvidence].sort((a, b) =>
				a.timestamp.localeCompare(b.timestamp),
			),
		[digitalEvidence],
	);

	const grouped = useMemo(() => groupByDay(sortedEvidence), [sortedEvidence]);

	async function handleRunCorrelation() {
		setCorrelating(true);
		setCorrelationError(null);
		try {
			const res = await fetch("/api/analyze/digital", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ caseId }),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(
					(body as { error?: string }).error ?? `HTTP ${res.status}`,
				);
			}
			const data = (await res.json()) as CorrelationResult;
			setCorrelationResult(data);
			toast.success(
				`Correlation complete — ${data.anomalies.length} anomal${data.anomalies.length === 1 ? "y" : "ies"} detected.`,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setCorrelationError(message);
			toast.error(`Correlation failed: ${message}`);
		} finally {
			setCorrelating(false);
		}
	}

	return (
		<div className="flex flex-col gap-0 w-full">
			{/* ─── SECTION 0: ADD / IMPORT EVIDENCE ─── */}
			<section className="border-b border-border-DEFAULT">
				<div className="px-4 py-2 border-b border-border-DEFAULT bg-surface-1 flex items-center gap-2">
					<span className="font-mono text-xs uppercase tracking-widest text-muted">
						Evidence Ingestion
					</span>
					<div className="flex-1" />
					<button
						type="button"
						onClick={() => {
							setMode(mode === "single" ? "none" : "single");
							setAddError(null);
							setAddStatus(null);
						}}
						className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${
							mode === "single"
								? "border-amber text-amber"
								: "border-border-DEFAULT text-muted hover:text-data"
						}`}
						style={{ borderRadius: 0 }}
					>
						+ Add Record
					</button>
					<button
						type="button"
						onClick={() => {
							setMode(mode === "csv" ? "none" : "csv");
							setAddError(null);
							setAddStatus(null);
						}}
						className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${
							mode === "csv"
								? "border-amber text-amber"
								: "border-border-DEFAULT text-muted hover:text-data"
						}`}
						style={{ borderRadius: 0 }}
					>
						Import CSV
					</button>
					<button
						type="button"
						onClick={() => {
							setMode(mode === "image" ? "none" : "image");
							setAddError(null);
							setAddStatus(null);
						}}
						className={`font-mono text-[10px] uppercase tracking-widest px-2.5 py-1 border ${
							mode === "image"
								? "border-amber text-amber"
								: "border-border-DEFAULT text-muted hover:text-data"
						}`}
						style={{ borderRadius: 0 }}
					>
						Upload Image
					</button>
				</div>

				<AnimatePresence initial={false}>
					{mode === "single" && (
						<motion.div
							key="single"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.2 }}
							className="p-4 border-b border-border-DEFAULT overflow-hidden"
						>
							<div className="grid grid-cols-1 md:grid-cols-3 gap-3">
								{[
									{ name: "sourceType", label: "Source Type", type: "select" },
									{ name: "sourceName", label: "Source Name *", type: "text", placeholder: "e.g. Eastport Cam 08" },
									{ name: "timestamp", label: "Timestamp *", type: "datetime-local" },
									{ name: "location", label: "Location", type: "text" },
									{ name: "subject", label: "Subject", type: "text" },
									{ name: "confidence", label: "Confidence (0–1)", type: "number" },
								].map((f) => (
									<div key={f.name}>
										<label className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
											{f.label}
										</label>
										{f.type === "select" ? (
											<select
												value={form.sourceType}
												onChange={(e) =>
													setForm({ ...form, sourceType: e.target.value as DigitalSourceType })
												}
												className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-xs px-2 py-1.5 outline-none focus:border-amber"
											>
												{["CCTV","MOBILE","FINANCIAL","SOCIAL","GPS","EMAIL","BROWSER"].map((s) => (
													<option key={s} value={s}>
														{s}
													</option>
												))}
											</select>
										) : (
											<input
												type={f.type}
												step={f.type === "number" ? "0.05" : undefined}
												min={f.type === "number" ? "0" : undefined}
												max={f.type === "number" ? "1" : undefined}
												placeholder={f.placeholder}
												value={(form as unknown as Record<string, string>)[f.name]}
												onChange={(e) =>
													setForm({ ...form, [f.name]: e.target.value })
												}
												className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-xs px-2 py-1.5 outline-none focus:border-amber"
											/>
										)}
									</div>
								))}
							</div>
							<div className="mt-3">
								<label className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
									Description
								</label>
								<textarea
									rows={2}
									value={form.description}
									onChange={(e) => setForm({ ...form, description: e.target.value })}
									placeholder="What happened in this digital event?"
									className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-xs px-2 py-1.5 outline-none focus:border-amber resize-y"
								/>
							</div>
							<div className="mt-3">
								<label className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
									Tags (comma-separated)
								</label>
								<input
									type="text"
									value={form.tags}
									onChange={(e) => setForm({ ...form, tags: e.target.value })}
									placeholder="e.g. loitering, pre-incident, unidentified"
									className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-xs px-2 py-1.5 outline-none focus:border-amber"
								/>
							</div>
							<div className="mt-3 flex items-center gap-3">
								<button
									type="button"
									onClick={submitSingle}
									disabled={adding}
									className="font-mono text-xs uppercase tracking-widest px-4 py-1.5 bg-amber text-base border border-amber disabled:opacity-50"
									style={{ color: "var(--bg)", borderRadius: 0 }}
								>
									{adding ? "Saving..." : "Save Record"}
								</button>
								{addStatus && (
									<span className="font-mono text-xs text-sage">{addStatus}</span>
								)}
								{addError && (
									<span className="font-mono text-xs text-crimson">{addError}</span>
								)}
							</div>
						</motion.div>
					)}

					{mode === "csv" && (
						<motion.div
							key="csv"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.2 }}
							className="p-4 border-b border-border-DEFAULT overflow-hidden"
						>
							<p className="font-mono text-[11px] text-muted mb-2">
								Paste comma-separated rows. First row must be the header. Required columns: <span className="text-data">sourceType, sourceName, timestamp</span>. Valid sourceType values: CCTV, MOBILE, FINANCIAL, SOCIAL, GPS, EMAIL, BROWSER.
							</p>
							<textarea
								rows={8}
								value={csv}
								onChange={(e) => setCsv(e.target.value)}
								placeholder={CSV_TEMPLATE}
								className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-xs px-3 py-2 outline-none focus:border-amber resize-y"
							/>
							<div className="mt-2 flex items-center gap-3 flex-wrap">
								<label
									className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border-DEFAULT text-muted hover:text-data cursor-pointer"
									style={{ borderRadius: 0 }}
								>
									Load .csv File
									<input
										type="file"
										accept=".csv,text/csv,text/plain"
										onChange={handleCsvFile}
										className="hidden"
									/>
								</label>
								<button
									type="button"
									onClick={() => setCsv(CSV_TEMPLATE)}
									className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border-DEFAULT text-muted hover:text-data"
									style={{ borderRadius: 0 }}
								>
									Insert Example
								</button>
								<button
									type="button"
									onClick={submitCsv}
									disabled={adding}
									className="font-mono text-xs uppercase tracking-widest px-4 py-1.5 bg-amber text-base border border-amber disabled:opacity-50"
									style={{ color: "var(--bg)", borderRadius: 0 }}
								>
									{adding ? "Importing..." : "Import"}
								</button>
								{addStatus && (
									<span className="font-mono text-xs text-sage">{addStatus}</span>
								)}
								{addError && (
									<span className="font-mono text-xs text-crimson">{addError}</span>
								)}
							</div>
							<p className="font-mono text-[10px] text-muted mt-2">
								Note: binary files (video, audio, phone dumps) cannot be analysed
								directly by the text LLM in this demo. Extract events into rows
								first — one row per CCTV clip, call, transaction, etc.
							</p>
						</motion.div>
					)}

					{mode === "image" && (
						<motion.div
							key="image"
							initial={{ opacity: 0, height: 0 }}
							animate={{ opacity: 1, height: "auto" }}
							exit={{ opacity: 0, height: 0 }}
							transition={{ duration: 0.2 }}
							className="p-4 border-b border-border-DEFAULT overflow-hidden"
						>
							<p className="font-mono text-[11px] text-muted mb-2">
								Upload a still image (CCTV frame, phone screenshot, receipt,
								chat screenshot, map, statement) and a vision LLM will extract
								structured digital-evidence events into the inventory. Supported:
								PNG, JPEG, WEBP, GIF · max 5 MB. Requires <span className="text-data">GROQ_API_KEY</span>.
							</p>
							<div className="flex items-center gap-3 flex-wrap">
								<label
									className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border-DEFAULT text-muted hover:text-data cursor-pointer"
									style={{ borderRadius: 0 }}
								>
									{imageFile ? "Change Image" : "Choose Image"}
									<input
										type="file"
										accept="image/png,image/jpeg,image/webp,image/gif"
										onChange={(e) => {
											const f = e.target.files?.[0] ?? null;
											setImageFile(f);
											setAddError(null);
											setAddStatus(null);
											e.target.value = "";
										}}
										className="hidden"
									/>
								</label>
								{imageFile && (
									<span className="font-mono text-xs text-data truncate max-w-[280px]">
										{imageFile.name}{" "}
										<span className="text-muted">
											({Math.round(imageFile.size / 1024)} KB)
										</span>
									</span>
								)}
							</div>
							<div className="mt-3">
								<label className="block font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
									Investigator Hint (optional)
								</label>
								<input
									type="text"
									value={imageHint}
									onChange={(e) => setImageHint(e.target.value)}
									placeholder="e.g. CCTV still from Pier 17 camera, 07 Nov 2024 approx 21:18"
									className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-xs px-2 py-1.5 outline-none focus:border-amber"
								/>
							</div>
							<div className="mt-3 flex items-center gap-3 flex-wrap">
								<button
									type="button"
									onClick={submitImage}
									disabled={adding || !imageFile}
									className="font-mono text-xs uppercase tracking-widest px-4 py-1.5 bg-amber text-base border border-amber disabled:opacity-50"
									style={{ color: "var(--bg)", borderRadius: 0 }}
								>
									{adding ? "Extracting..." : "Extract & Ingest"}
								</button>
								{addStatus && (
									<span className="font-mono text-xs text-sage">{addStatus}</span>
								)}
								{addError && (
									<span className="font-mono text-xs text-crimson">{addError}</span>
								)}
							</div>
						</motion.div>
					)}
				</AnimatePresence>
			</section>

			{/* ─── SECTION 1: EVIDENCE INVENTORY ─── */}
			<section className="border-b border-border-DEFAULT">
				<div className="px-4 py-2 border-b border-border-DEFAULT bg-surface-1">
					<span className="font-mono text-xs uppercase tracking-widest text-muted">
						Evidence Inventory
					</span>
					<span className="font-mono text-xs text-muted ml-2">
						({digitalEvidence.length})
					</span>
				</div>

				<div className="overflow-x-auto">
					<table className="w-full border-collapse">
						<thead>
							<tr className="border-b border-border-DEFAULT">
								{[
									"Type",
									"Source",
									"Timestamp",
									"Subject",
									"Location",
									"Anomaly",
									"Confidence",
								].map((h) => (
									<th
										key={h}
										className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wider text-muted whitespace-nowrap"
									>
										{h}
									</th>
								))}
							</tr>
						</thead>
						<tbody>
							{sortedEvidence.length === 0 && (
								<tr>
									<td
										colSpan={7}
										className="px-3 py-6 text-center font-mono text-xs text-muted uppercase tracking-widest"
									>
										No Digital Evidence
									</td>
								</tr>
							)}
							{sortedEvidence.map((ev, i) => (
								<motion.tr
									key={ev.id}
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{
										duration: 0.25,
										ease: "easeOut",
										delay: i * 0.015,
									}}
									className="border-t border-border-DEFAULT hover:bg-surface-2"
								>
									<td className="px-3 py-2 whitespace-nowrap">
										<span className="inline-flex items-center gap-1 font-mono text-xs text-muted">
											<SourceIcon type={ev.sourceType} />
											{ev.sourceType}
										</span>
									</td>
									<td className="px-3 py-2 text-sm text-data max-w-[120px] truncate">
										{ev.sourceName}
									</td>
									<td className="px-3 py-2 font-mono text-xs text-muted whitespace-nowrap">
										{formatTimestamp(ev.timestamp)}
									</td>
									<td className="px-3 py-2 text-sm text-data max-w-[140px] truncate">
										{ev.subject}
									</td>
									<td className="px-3 py-2 text-sm text-muted max-w-[120px] truncate">
										{ev.location}
									</td>
									<td className="px-3 py-2 whitespace-nowrap">
										<div className="flex items-center gap-1.5">
											<span
												className={`font-mono text-xs ${anomalyTextClass(ev.anomalyScore)}`}
											>
												{ev.anomalyScore}
											</span>
											<div
												className="bg-surface-3"
												style={{ width: 32, height: 3 }}
											>
												<div
													style={{
														width: `${ev.anomalyScore}%`,
														height: "100%",
														background: anomalyColor(ev.anomalyScore),
													}}
												/>
											</div>
										</div>
									</td>
									<td className="px-3 py-2">
										<ConfidenceBar value={ev.confidence} height={3} showLabel />
									</td>
								</motion.tr>
							))}
						</tbody>
					</table>
				</div>
			</section>

			{/* ─── SECTION 2: CORRELATION ANALYSIS ─── */}
			<section className="border-b border-border-DEFAULT">
				<div className="px-4 py-2 border-b border-border-DEFAULT bg-surface-1">
					<span className="font-mono text-xs uppercase tracking-widest text-muted">
						Correlation Analysis
					</span>
				</div>
				<div className="p-4">
					<div className="flex items-center gap-3">
						<button
							onClick={handleRunCorrelation}
							disabled={correlating || digitalEvidence.length === 0}
							className="font-mono text-xs uppercase tracking-widest px-4 py-2 border border-amber text-amber disabled:opacity-50 disabled:cursor-not-allowed"
							style={{ borderRadius: 0 }}
						>
							{correlating ? "Correlating..." : "Run Correlation Analysis"}
						</button>
						{digitalEvidence.length === 0 && (
							<span className="font-mono text-xs text-muted">
								Add digital evidence records above to enable correlation.
							</span>
						)}
						{digitalEvidence.length > 0 && !correlationResult && !correlating && (
							<span className="font-mono text-xs text-muted">
								Analyses {digitalEvidence.length} record
								{digitalEvidence.length === 1 ? "" : "s"} for timeline gaps,
								bursts, repeat subjects, and suspicious anomaly scores.
							</span>
						)}
					</div>

					{correlationError && (
						<div className="mt-3 font-mono text-xs text-crimson border border-crimson px-3 py-2">
							ERROR: {correlationError}
						</div>
					)}

					<AnimatePresence>
						{correlationResult && (
							<motion.div
								initial={{ opacity: 0, y: 8 }}
								animate={{ opacity: 1, y: 0 }}
								transition={{ duration: 0.25, ease: "easeOut" }}
								className="mt-4 flex flex-col gap-4"
							>
								{correlationResult.summary && (
									<div className="bg-surface-2 border-l-2 border-amber px-3 py-2">
										<div className="font-mono text-[10px] uppercase tracking-widest text-muted mb-1">
											Investigator Summary
											{typeof correlationResult.eventCount === "number" &&
												` · ${correlationResult.eventCount} event${
													correlationResult.eventCount === 1 ? "" : "s"
												}`}
										</div>
										<p className="text-sm text-data leading-relaxed">
											{correlationResult.summary}
										</p>
									</div>
								)}
								{/* Anomalies */}
								<div>
									<div className="font-mono text-xs uppercase tracking-widest text-muted mb-2">
										Anomalies Detected ({correlationResult.anomalies.length})
									</div>
									<div className="overflow-x-auto">
									<table className="w-full border-collapse" style={{ minWidth: 560 }}>
										<thead>
											<tr className="border-b border-border-DEFAULT">
												{[
													"Severity",
													"Type",
													"Description",
													"Affected Timestamps",
												].map((h) => (
													<th
														key={h}
														className="px-3 py-1.5 text-left font-mono text-xs uppercase tracking-wider text-muted"
													>
														{h}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{correlationResult.anomalies.map((a, i) => (
												<motion.tr
													key={i}
													initial={{ opacity: 0, y: 8 }}
													animate={{ opacity: 1, y: 0 }}
													transition={{
														duration: 0.25,
														ease: "easeOut",
														delay: i * 0.04,
													}}
													className="border-t border-border-DEFAULT"
												>
													<td className="px-3 py-2">
														<Badge variant={severityVariant(a.severity)}>
															{a.severity}
														</Badge>
													</td>
													<td className="px-3 py-2 font-mono text-xs text-data">
														{a.type}
													</td>
													<td className="px-3 py-2 text-sm text-data max-w-[240px]">
														{a.description}
													</td>
													<td className="px-3 py-2 font-mono text-xs text-muted">
														{a.timestamps
															.map((t) => formatTimestamp(t))
															.join(", ")}
													</td>
												</motion.tr>
											))}
											{correlationResult.anomalies.length === 0 && (
												<tr>
													<td
														colSpan={4}
														className="px-3 py-4 text-center font-mono text-xs text-muted uppercase tracking-widest"
													>
														No Anomalies Detected
													</td>
												</tr>
											)}
										</tbody>
									</table>
									</div>
								</div>

								{/* Patterns */}
								<div>
									<div className="font-mono text-xs uppercase tracking-widest text-muted mb-2">
										Identified Patterns
									</div>
									<div className="flex flex-col gap-1.5">
										{correlationResult.patterns.map((p, i) => (
											<motion.div
												key={i}
												initial={{ opacity: 0, y: 8 }}
												animate={{ opacity: 1, y: 0 }}
												transition={{
													duration: 0.25,
													ease: "easeOut",
													delay: i * 0.04,
												}}
												className="flex items-center gap-3 bg-surface-2 px-3 py-2"
											>
												<span className="text-sm text-data flex-1">
													{p.label}
												</span>
												<ConfidenceBar
													value={p.confidence}
													height={3}
													className="w-24"
												/>
												<span
													className="font-mono text-xs text-muted"
													style={{ minWidth: "4ch" }}
												>
													{p.confidence}%
												</span>
											</motion.div>
										))}
										{correlationResult.patterns.length === 0 && (
											<p className="font-mono text-xs text-muted uppercase tracking-widest">
												No patterns identified
											</p>
										)}
									</div>
								</div>

								{/* Digital Risk */}
								<div className="flex items-center gap-3 border-t border-border-DEFAULT pt-3">
									<span className="font-mono text-xs uppercase tracking-widest text-muted">
										Digital Risk Contribution:
									</span>
									<span
										className="font-mono text-sm"
										style={{
											color: anomalyColor(correlationResult.digitalRisk),
										}}
									>
										{correlationResult.digitalRisk}/100
									</span>
								</div>
							</motion.div>
						)}
					</AnimatePresence>
				</div>
			</section>

			{/* ─── SECTION 3: TIMELINE VIEW ─── */}
			<section>
				<div className="px-4 py-2 border-b border-border-DEFAULT bg-surface-1">
					<span className="font-mono text-xs uppercase tracking-widest text-muted">
						Chronological Timeline
					</span>
				</div>
				<div className="overflow-x-auto">
					<table className="w-full border-collapse" style={{ minWidth: 640 }}>
						<thead>
							<tr className="border-b border-border-DEFAULT">
								{["Time", "Source", "Subject", "Description", "Location"].map(
									(h) => (
										<th
											key={h}
											className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wider text-muted whitespace-nowrap"
										>
											{h}
										</th>
									),
								)}
							</tr>
						</thead>
						<tbody>
							{grouped.map(({ date, items }) => (
								<>
									<tr
										key={`sep-${date}`}
										className="border-t border-border-DEFAULT bg-surface-2"
									>
										<td colSpan={5} className="px-3 py-1">
											<span className="font-mono text-xs uppercase tracking-widest text-muted">
												{date}
											</span>
										</td>
									</tr>
									{items.map((ev, i) => (
										<motion.tr
											key={ev.id}
											initial={{ opacity: 0, y: 8 }}
											animate={{ opacity: 1, y: 0 }}
											transition={{
												duration: 0.25,
												ease: "easeOut",
												delay: i * 0.015,
											}}
											className="border-t border-border-DEFAULT hover:bg-surface-2"
											style={
												ev.anomalyScore > 70
													? { borderLeft: "2px solid var(--crimson)" }
													: undefined
											}
										>
											<td className="px-3 py-2 font-mono text-xs text-muted whitespace-nowrap">
												{ev.timestamp ? ev.timestamp.slice(11, 19) : "—"}
											</td>
											<td className="px-3 py-2 whitespace-nowrap">
												<span className="inline-flex items-center gap-1 font-mono text-xs text-muted">
													<SourceIcon type={ev.sourceType} />
													{ev.sourceType}
												</span>
											</td>
											<td className="px-3 py-2 text-sm text-data max-w-[140px] truncate">
												{ev.subject}
											</td>
											<td className="px-3 py-2 text-sm text-data max-w-[200px]">
												{ev.description}
											</td>
											<td className="px-3 py-2 text-sm text-muted max-w-[120px] truncate">
												{ev.location}
											</td>
										</motion.tr>
									))}
								</>
							))}
							{grouped.length === 0 && (
								<tr>
									<td
										colSpan={5}
										className="px-3 py-6 text-center font-mono text-xs text-muted uppercase tracking-widest"
									>
										No Events
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</section>
		</div>
	);
}
