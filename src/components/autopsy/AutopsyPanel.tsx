"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText } from "lucide-react";
import type { AutopsyReport } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useToast } from "@/components/ui/Toast";

interface AutopsyPanelProps {
	caseId: string;
	existingReport?: AutopsyReport;
}

type MannerOfDeath =
	| "HOMICIDE"
	| "SUICIDE"
	| "NATURAL"
	| "ACCIDENTAL"
	| "UNDETERMINED";

function mannerVariant(
	manner: string,
): "crimson" | "amber" | "sage" | "sky" | "dim" {
	const m = manner.toUpperCase() as MannerOfDeath;
	if (m === "HOMICIDE") return "crimson";
	if (m === "SUICIDE") return "amber";
	if (m === "NATURAL") return "sage";
	if (m === "ACCIDENTAL") return "sky";
	return "dim";
}

interface FormState {
	rawReport: string;
	bodyTemperature: string;
	ambientTemperature: string;
	rigorMortisStage: string;
	livorMortisState: string;
}

const RIGOR_OPTIONS = [
	{ value: "0", label: "None" },
	{ value: "1", label: "Early Onset" },
	{ value: "2", label: "Full Rigor" },
	{ value: "3", label: "Resolving" },
];

const LIVOR_OPTIONS = [
	{ value: "not_present", label: "Not Present" },
	{ value: "faint", label: "Faint" },
	{ value: "well_defined", label: "Well-Defined" },
	{ value: "fixed", label: "Fixed" },
];

const labelClass =
	"block font-mono text-xs uppercase tracking-widest text-muted mb-1";
const inputClass =
	"w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-sm px-3 py-2 outline-none focus:border-amber placeholder:text-muted";
const selectClass =
	"w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-sm px-3 py-2 outline-none focus:border-amber";

function SectionLabel({ children }: { children: React.ReactNode }) {
	return (
		<div className="font-mono text-xs uppercase tracking-widest text-muted mb-1 mt-4 first:mt-0">
			{children}
		</div>
	);
}

export function AutopsyPanel({ caseId, existingReport }: AutopsyPanelProps) {
	const toast = useToast();
	const [form, setForm] = useState<FormState>({
		rawReport: existingReport?.rawReport ?? "",
		bodyTemperature: existingReport?.bodyTemperature?.toString() ?? "",
		ambientTemperature: "",
		rigorMortisStage: existingReport?.rigorMortisStage?.toString() ?? "0",
		livorMortisState: existingReport?.livorMortisState ?? "not_present",
	});

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<AutopsyReport | null>(
		existingReport ?? null,
	);

	// Upload extraction state
	const [extracting, setExtracting] = useState<"image" | "csv" | null>(null);
	const [extractStatus, setExtractStatus] = useState<string | null>(null);

	// Draft state
	const [savingDraft, setSavingDraft] = useState(false);
	const [draftStatus, setDraftStatus] = useState<string | null>(null);
	const [draftRestored, setDraftRestored] = useState(false);

	// On mount, if the case has a saved draft newer than the existing report,
	// prefill from the draft.
	useEffect(() => {
		let cancelled = false;
		async function loadDraft() {
			try {
				const res = await fetch(`/api/cases/${caseId}/autopsy-draft`);
				if (!res.ok) return;
				const data = await res.json();
				if (cancelled || !data.draft) return;

				// Only prefill from draft if there's no existing report that's
				// already populated the form, OR the draft has content the user
				// hasn't analysed yet.
				const draft = data.draft;
				const draftIsMoreRecent =
					!existingReport ||
					(draft.savedAt &&
						new Date(draft.savedAt).getTime() >
							new Date(existingReport.analyzedAt).getTime());
				if (!draftIsMoreRecent) return;

				setForm({
					rawReport: draft.rawReport ?? "",
					bodyTemperature: draft.bodyTemperature ?? "",
					ambientTemperature: draft.ambientTemperature ?? "",
					rigorMortisStage: draft.rigorMortisStage ?? "0",
					livorMortisState: draft.livorMortisState ?? "not_present",
				});
				setDraftRestored(true);
				setDraftStatus(
					`Draft restored (saved ${new Date(draft.savedAt).toLocaleString()}).`,
				);
			} catch {
				/* noop */
			}
		}
		loadDraft();
		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [caseId]);

	async function saveDraft() {
		setSavingDraft(true);
		setDraftStatus(null);
		setError(null);
		try {
			const res = await fetch(`/api/cases/${caseId}/autopsy-draft`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(form),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			setDraftStatus(
				`Draft saved at ${new Date(data.savedAt).toLocaleTimeString()}.`,
			);
			toast.success("Draft saved.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Draft save failed";
			setError(message);
			toast.error(`Draft save failed: ${message}`);
		} finally {
			setSavingDraft(false);
		}
	}

	async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setExtracting("image");
		setError(null);
		setExtractStatus(`Transcribing ${file.name}...`);
		try {
			const fd = new FormData();
			fd.append("image", file);
			const res = await fetch("/api/analyze/autopsy/extract-image", {
				method: "POST",
				body: fd,
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			setForm((f) => ({ ...f, rawReport: data.text }));
			setExtractStatus(
				`Transcribed ${file.name} (${Math.round(file.size / 1024)} KB). Review and click Run Analysis.`,
			);
			toast.success(`Transcribed ${file.name}.`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "Image extraction failed";
			setError(message);
			setExtractStatus(null);
			toast.error(`Image extraction failed: ${message}`);
		} finally {
			setExtracting(null);
		}
	}

	async function handleCsvUpload(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		e.target.value = "";
		if (!file) return;
		setExtracting("csv");
		setError(null);
		setExtractStatus(`Parsing ${file.name}...`);
		try {
			const fd = new FormData();
			fd.append("csv", file);
			const res = await fetch("/api/analyze/autopsy/extract-csv", {
				method: "POST",
				body: fd,
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			setForm((f) => ({ ...f, rawReport: data.text }));
			setExtractStatus(
				`Parsed ${file.name} (${data.rowsParsed} rows). Review and click Run Analysis.`,
			);
			toast.success(`Parsed ${file.name} (${data.rowsParsed} rows).`);
		} catch (err) {
			const message =
				err instanceof Error ? err.message : "CSV extraction failed";
			setError(message);
			setExtractStatus(null);
			toast.error(`CSV extraction failed: ${message}`);
		} finally {
			setExtracting(null);
		}
	}

	function handleChange(
		e: React.ChangeEvent<
			HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement
		>,
	) {
		setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		const trimmed = form.rawReport.trim();
		if (!trimmed) {
			setError("Paste the autopsy report before running analysis.");
			return;
		}

		// Validate optional temperature fields if the user filled them in.
		const bt = form.bodyTemperature.trim();
		const at = form.ambientTemperature.trim();
		if (bt) {
			const n = parseFloat(bt);
			if (!Number.isFinite(n) || n < 0 || n > 42) {
				setError("Body temperature must be between 0 and 42 °C (or left blank).");
				return;
			}
		}
		if (at) {
			const n = parseFloat(at);
			if (!Number.isFinite(n) || n < -40 || n > 60) {
				setError("Ambient temperature must be between -40 and 60 °C (or left blank).");
				return;
			}
		}

		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/analyze/autopsy", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					caseId,
					reportText: trimmed,
					bodyTemperature: bt ? parseFloat(bt) : null,
					ambientTemperature: at ? parseFloat(at) : null,
					rigorMortisStage: parseInt(form.rigorMortisStage, 10),
					livorMortisState: form.livorMortisState,
				}),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(
					(body as { error?: string }).error ?? `HTTP ${res.status}`,
				);
			}
			const data = (await res.json()) as AutopsyReport;
			setResult(data);
			toast.success("Autopsy analysis complete.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(message);
			toast.error(`Analysis failed: ${message}`);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex flex-col md:flex-row gap-0 w-full md:min-h-[500px]">
			{/* LEFT PANE */}
			<div className="w-full md:w-[40%] border-b md:border-b-0 md:border-r border-border-DEFAULT p-4 flex flex-col gap-3">
				<div className="font-mono text-xs uppercase tracking-widest text-muted border-b border-border-DEFAULT pb-2">
					Autopsy Analysis Input
				</div>
				<form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1">
					<div className="flex items-center gap-2 flex-wrap">
						<label
							className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border-DEFAULT text-muted hover:text-data cursor-pointer"
							style={{ borderRadius: 0 }}
						>
							{extracting === "image" ? "Transcribing..." : "Upload Image"}
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp,image/gif"
								onChange={handleImageUpload}
								disabled={extracting !== null || loading}
								className="hidden"
							/>
						</label>
						<label
							className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border-DEFAULT text-muted hover:text-data cursor-pointer"
							style={{ borderRadius: 0 }}
						>
							{extracting === "csv" ? "Parsing..." : "Upload CSV"}
							<input
								type="file"
								accept=".csv,text/csv,text/plain"
								onChange={handleCsvUpload}
								disabled={extracting !== null || loading}
								className="hidden"
							/>
						</label>
						{extractStatus && (
							<span className="font-mono text-[10px] text-sage flex-1">
								{extractStatus}
							</span>
						)}
					</div>
					<div>
						<label className={labelClass} htmlFor="rawReport">
							Raw Report Text
						</label>
						<textarea
							id="rawReport"
							name="rawReport"
							value={form.rawReport}
							onChange={handleChange}
							placeholder="Paste complete autopsy report, or use Upload Image / Upload CSV above to populate this field."
							className={`${inputClass} resize-y`}
							style={{
								minHeight: 280,
								fontFamily: "'JetBrains Mono', monospace",
							}}
						/>
					</div>

					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className={labelClass} htmlFor="bodyTemperature">
								Body Temp (°C)
							</label>
							<input
								id="bodyTemperature"
								name="bodyTemperature"
								type="number"
								step="0.1"
								min="0"
								max="42"
								value={form.bodyTemperature}
								onChange={handleChange}
								className={inputClass}
								placeholder="0-42 °C"
								title="Body temperature at scene, in degrees Celsius. Valid range 0-42 °C."
							/>
						</div>
						<div>
							<label className={labelClass} htmlFor="ambientTemperature">
								Ambient Temp (°C)
							</label>
							<input
								id="ambientTemperature"
								name="ambientTemperature"
								type="number"
								step="0.1"
								min="-40"
								max="60"
								value={form.ambientTemperature}
								onChange={handleChange}
								className={inputClass}
								placeholder="-40 to 60 °C"
								title="Ambient environmental temperature, in degrees Celsius. Valid range -40 to 60 °C."
							/>
						</div>
					</div>

					<div>
						<label className={labelClass} htmlFor="rigorMortisStage">
							Rigor Mortis Stage
						</label>
						<select
							id="rigorMortisStage"
							name="rigorMortisStage"
							value={form.rigorMortisStage}
							onChange={handleChange}
							className={selectClass}
						>
							{RIGOR_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</div>

					<div>
						<label className={labelClass} htmlFor="livorMortisState">
							Livor Mortis State
						</label>
						<select
							id="livorMortisState"
							name="livorMortisState"
							value={form.livorMortisState}
							onChange={handleChange}
							className={selectClass}
						>
							{LIVOR_OPTIONS.map((o) => (
								<option key={o.value} value={o.value}>
									{o.label}
								</option>
							))}
						</select>
					</div>

					{error && (
						<div className="font-mono text-xs text-crimson border border-crimson px-3 py-2">
							ERROR: {error}
						</div>
					)}

					{draftStatus && !error && (
						<div
							className="font-mono text-[10px] px-3 py-2 border"
							style={{
								borderColor: draftRestored
									? "var(--sky)"
									: "var(--sage)",
								color: draftRestored ? "var(--sky)" : "var(--sage)",
							}}
						>
							{draftStatus}
						</div>
					)}

					<div className="flex items-center gap-2 mt-auto">
						<button
							type="button"
							onClick={saveDraft}
							disabled={savingDraft || loading}
							className="flex-1 font-mono text-xs uppercase tracking-widest px-4 py-2.5 border border-border-DEFAULT text-data hover:border-amber hover:text-amber disabled:opacity-50 disabled:cursor-not-allowed"
							style={{ borderRadius: 0 }}
							title="Save the current inputs to this case without running analysis. You can return and edit later."
						>
							{savingDraft ? "Saving..." : "Save Draft"}
						</button>
						<button
							type="submit"
							disabled={loading || form.rawReport.trim().length === 0}
							className="flex-1 font-mono text-xs uppercase tracking-widest px-4 py-2.5 bg-amber text-base border border-amber disabled:opacity-50 disabled:cursor-not-allowed"
							style={{ color: "var(--bg)", borderRadius: 0 }}
						>
							{loading ? "Processing..." : "Run Analysis"}
						</button>
					</div>
				</form>
			</div>

			{/* RIGHT PANE */}
			<div className="flex-1 p-4 overflow-y-auto">
				<AnimatePresence mode="wait">
					{loading && (
						<motion.div
							key="loading"
							initial={{ opacity: 0 }}
							animate={{ opacity: 1 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
							className="flex flex-col items-center justify-center h-full min-h-[300px] gap-2"
						>
							<span className="font-mono text-sm uppercase tracking-widest text-muted">
								Processing
							</span>
							<LoadingDots />
						</motion.div>
					)}

					{!loading && !result && (
						<motion.div
							key="empty"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
							className="flex flex-col items-center justify-center h-full min-h-[300px] gap-3 text-muted"
						>
							<FileText size={32} strokeWidth={1} className="text-muted" />
							<span className="font-mono text-xs uppercase tracking-widest">
								Submit Report for Analysis
							</span>
						</motion.div>
					)}

					{!loading && result && (
						<motion.div
							key="result"
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.25, ease: "easeOut" }}
							className="flex flex-col gap-1"
						>
							<div className="font-mono text-xs uppercase tracking-widest text-muted border-b border-border-DEFAULT pb-2 mb-3">
								Analysis Result — {formatDateTime(result.analyzedAt)}
							</div>

							<SectionLabel>Cause of Death</SectionLabel>
							<p className="font-mono text-sm text-data">
								{result.causeOfDeath}
							</p>

							<SectionLabel>Manner of Death</SectionLabel>
							<Badge variant={mannerVariant(result.mannerOfDeath)}>
								{result.mannerOfDeath}
							</Badge>

							<SectionLabel>Postmortem Interval</SectionLabel>
							<p className="font-mono text-sm text-data">
								{result.postmortemInterval}
							</p>

							<SectionLabel>Injury Pattern</SectionLabel>
							<p className="text-sm text-data leading-relaxed">
								{result.injuryPattern}
							</p>

							<SectionLabel>Toxicology</SectionLabel>
							<p
								className={`text-sm leading-relaxed ${
									result.toxicologyFindings &&
									result.toxicologyFindings.toLowerCase() !== "none" &&
									result.toxicologyFindings.toLowerCase() !== "negative" &&
									result.toxicologyFindings.trim() !== ""
										? "text-crimson"
										: "text-data"
								}`}
							>
								{result.toxicologyFindings ||
									"No toxicological substances detected."}
							</p>

							<SectionLabel>Wounds Catalog</SectionLabel>
							<p className="font-mono text-sm text-data">
								{result.woundsCount} wound{result.woundsCount !== 1 ? "s" : ""}{" "}
								documented
							</p>

							<SectionLabel>Analysis Confidence</SectionLabel>
							<div className="flex items-center gap-3">
								<ConfidenceBar
									value={result.confidence}
									height={4}
									className="flex-1"
								/>
								<span
									className="font-mono text-sm text-amber"
									style={{ minWidth: "4ch" }}
								>
									{result.confidence}%
								</span>
							</div>
							{result.confidence < 30 && (
								<p className="text-xs text-muted mt-1 leading-relaxed">
									Low confidence. The model judged the input too brief or
									informal to extract strong clinical signal. Paste a fuller
									autopsy narrative with cause, manner, injuries, and
									toxicology findings for a higher-quality analysis.
								</p>
							)}

							{result.analysisNotes && (
								<>
									<SectionLabel>Analysis Notes</SectionLabel>
									<p className="text-sm italic text-muted leading-relaxed">
										{result.analysisNotes}
									</p>
								</>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

function LoadingDots() {
	return (
		<div className="flex gap-1">
			{[0, 1, 2].map((i) => (
				<motion.span
					key={i}
					className="inline-block w-1.5 h-1.5 bg-amber"
					animate={{ opacity: [0.3, 1, 0.3] }}
					transition={{
						duration: 1.2,
						repeat: Infinity,
						delay: i * 0.2,
						ease: "easeInOut",
					}}
				/>
			))}
		</div>
	);
}

export default AutopsyPanel;
