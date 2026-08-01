"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Clock } from "lucide-react";
import type { TodEstimate } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useToast } from "@/components/ui/Toast";

interface TodPanelProps {
	caseId: string;
	existingEstimate?: TodEstimate;
}

interface FormState {
	bodyTemp: string;
	ambientTemp: string;
	bodyWeight: string;
	rigorMortisStage: string;
	livorMortisState: string;
	lastSeenAlive: string;
}

const RIGOR_OPTIONS = [
	{ value: "0", label: "None" },
	{ value: "1", label: "Early" },
	{ value: "2", label: "Full" },
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

export function TodPanel({ caseId, existingEstimate }: TodPanelProps) {
	const toast = useToast();
	const [form, setForm] = useState<FormState>({
		bodyTemp: existingEstimate?.bodyTemp?.toString() ?? "",
		ambientTemp: existingEstimate?.ambientTemp?.toString() ?? "",
		bodyWeight: "70",
		rigorMortisStage: existingEstimate?.rigorMortisStage?.toString() ?? "0",
		livorMortisState: existingEstimate?.livorMortisState ?? "not_present",
		lastSeenAlive: existingEstimate?.lastSeenAlive ?? "",
	});

	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<TodEstimate | null>(
		existingEstimate ?? null,
	);

	function handleChange(
		e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
	) {
		setForm((f) => ({ ...f, [e.target.name]: e.target.value }));
	}

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();

		// Client-side physical-plausibility validation.
		const bt = parseFloat(form.bodyTemp);
		const at = parseFloat(form.ambientTemp);
		const wt = parseFloat(form.bodyWeight);
		if (!Number.isFinite(bt) || bt < 0 || bt > 42) {
			setError(
				"Body temperature must be between 0 and 42 °C. A body cannot sustain a temperature outside this range.",
			);
			return;
		}
		if (!Number.isFinite(at) || at < -40 || at > 60) {
			setError(
				"Ambient temperature must be between -40 and 60 °C (realistic environmental range).",
			);
			return;
		}
		if (form.bodyWeight && (!Number.isFinite(wt) || wt < 2 || wt > 300)) {
			setError(
				"Body weight must be between 2 and 300 kg. Leave blank to use the 70 kg default.",
			);
			return;
		}
		if (bt <= at) {
			setError(
				"Body temperature is at or below ambient — Henssge cooling cannot produce an estimate. The body must be warmer than the environment for meaningful PMI from cooling.",
			);
			return;
		}

		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/analyze/tod", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					caseId,
					bodyTemp: bt,
					ambientTemp: at,
					weight: Number.isFinite(wt) && wt > 0 ? wt : 70,
					rigorMortisStage: parseInt(form.rigorMortisStage, 10),
					livorMortisState: form.livorMortisState,
					lastSeenAlive: form.lastSeenAlive || null,
				}),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(
					(body as { error?: string }).error ?? `HTTP ${res.status}`,
				);
			}
			const data = (await res.json()) as TodEstimate;
			setResult(data);
			toast.success("Time-of-death estimate generated.");
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(message);
			toast.error(`TOD estimation failed: ${message}`);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="flex flex-col md:flex-row gap-0 w-full md:min-h-[500px]">
			{/* LEFT PANE */}
			<div className="w-full md:w-[40%] border-b md:border-b-0 md:border-r border-border-DEFAULT p-4 flex flex-col gap-3">
				<div className="font-mono text-xs uppercase tracking-widest text-muted border-b border-border-DEFAULT pb-2">
					Tod Estimation Input
				</div>
				<form onSubmit={handleSubmit} className="flex flex-col gap-3 flex-1">
					<div className="grid grid-cols-2 gap-3">
						<div>
							<label className={labelClass} htmlFor="tod-bodyTemp">
								Body Temp (°C)
							</label>
							<input
								id="tod-bodyTemp"
								name="bodyTemp"
								type="number"
								step="0.1"
								min="0"
								max="42"
								value={form.bodyTemp}
								onChange={handleChange}
								className={inputClass}
								placeholder="0-42 °C"
								title="Body temperature at scene, in degrees Celsius. Valid range 0-42 °C."
							/>
						</div>
						<div>
							<label className={labelClass} htmlFor="tod-ambientTemp">
								Ambient Temp (°C)
							</label>
							<input
								id="tod-ambientTemp"
								name="ambientTemp"
								type="number"
								step="0.1"
								min="-40"
								max="60"
								value={form.ambientTemp}
								onChange={handleChange}
								className={inputClass}
								placeholder="-40 to 60 °C"
								title="Ambient environmental temperature, in degrees Celsius. Valid range -40 to 60 °C."
							/>
						</div>
					</div>

					<div>
						<label className={labelClass} htmlFor="tod-bodyWeight">
							Body Weight (kg)
						</label>
						<input
							id="tod-bodyWeight"
							name="bodyWeight"
							type="number"
							step="0.1"
							min="2"
							max="300"
							value={form.bodyWeight}
							onChange={handleChange}
							className={inputClass}
							placeholder="2-300 kg (default 70)"
							title="Body weight, in kilograms. Valid range 2-300 kg."
						/>
					</div>

					<div>
						<label className={labelClass} htmlFor="tod-rigorMortisStage">
							Rigor Mortis Stage
						</label>
						<select
							id="tod-rigorMortisStage"
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
						<label className={labelClass} htmlFor="tod-livorMortisState">
							Livor Mortis State
						</label>
						<select
							id="tod-livorMortisState"
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

					<div>
						<label className={labelClass} htmlFor="tod-lastSeenAlive">
							Last Seen Alive (optional)
						</label>
						<input
							id="tod-lastSeenAlive"
							name="lastSeenAlive"
							type="datetime-local"
							value={form.lastSeenAlive}
							onChange={handleChange}
							className={inputClass}
						/>
					</div>

					{error && (
						<div className="font-mono text-xs text-crimson border border-crimson px-3 py-2">
							ERROR: {error}
						</div>
					)}

					<button
						type="submit"
						disabled={loading}
						className="w-full mt-auto font-mono text-xs uppercase tracking-widest px-4 py-2.5 bg-amber border border-amber disabled:opacity-50 disabled:cursor-not-allowed"
						style={{ color: "var(--bg)", borderRadius: 0 }}
					>
						{loading ? "Processing..." : "Estimate Time of Death"}
					</button>
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
							<Clock size={32} strokeWidth={1} className="text-muted" />
							<span className="font-mono text-xs uppercase tracking-widest">
								Submit Parameters to Estimate TOD
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
								Estimated Time of Death Window
							</div>

							{/* TOD Window */}
							<div className="bg-surface-2 border border-border-DEFAULT p-4 mb-2">
								<div className="grid grid-cols-2 gap-4 mb-3">
									<div>
										<div className="font-mono text-xs uppercase tracking-widest text-muted mb-1">
											From
										</div>
										<div className="font-mono text-sm text-amber">
											{formatDateTime(result.estimatedTodEarliest)}
										</div>
									</div>
									<div>
										<div className="font-mono text-xs uppercase tracking-widest text-muted mb-1">
											To
										</div>
										<div className="font-mono text-sm text-amber">
											{formatDateTime(result.estimatedTodLatest)}
										</div>
									</div>
								</div>
								<div>
									<div className="font-mono text-xs uppercase tracking-widest text-muted mb-1">
										Central Estimate
									</div>
									<div className="font-mono text-base text-data">
										{formatDateTime(
											result.centralEstimate || result.estimatedAt,
										)}
									</div>
								</div>
							</div>

							{/* Last Seen Alive anchor */}
							{result.lastSeenAlive && (
								<div className="border-l-2 border-sky pl-3 mb-2">
									<div className="font-mono text-xs uppercase tracking-widest text-muted mb-0.5">
										Last Seen Alive
									</div>
									<div className="font-mono text-sm text-sky">
										{formatDateTime(result.lastSeenAlive)}
									</div>
								</div>
							)}

							<SectionLabel>Postmortem Interval</SectionLabel>
							<p className="font-mono text-sm text-data">
								{result.notes || "—"}
							</p>

							<SectionLabel>Methodology</SectionLabel>
							<p className="text-sm italic text-muted leading-relaxed">
								{result.methodology}
							</p>

							<SectionLabel>Confidence Level</SectionLabel>
							<div className="flex items-center gap-3">
								<ConfidenceBar
									value={result.confidenceLevel}
									height={4}
									className="flex-1"
								/>
								<span
									className="font-mono text-sm text-amber"
									style={{ minWidth: "4ch" }}
								>
									{result.confidenceLevel}%
								</span>
							</div>

							{result.confidenceLevel < 50 && (
								<motion.div
									initial={{ opacity: 0, y: 8 }}
									animate={{ opacity: 1, y: 0 }}
									transition={{ duration: 0.25, ease: "easeOut" }}
									className="mt-3 border border-amber px-3 py-2"
								>
									<span className="font-mono text-xs uppercase tracking-widest text-amber">
										⚠ Low Confidence — Multiple methods conflict
									</span>
								</motion.div>
							)}
						</motion.div>
					)}
				</AnimatePresence>
			</div>
		</div>
	);
}

export default TodPanel;
