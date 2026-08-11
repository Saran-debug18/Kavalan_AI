"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, AlertTriangle, Check, X } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { ConfidenceBar } from "@/components/ui/ConfidenceBar";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/utils";
import type { TimelineEvent, TimelineInconsistency, TimelineReconstruction as TimelineReconstructionData } from "@/types";

interface TimelineReconstructionProps {
	caseId: string;
	existing?: TimelineReconstructionData;
	onGenerated?: (result: TimelineReconstructionData) => void;
}

const SOURCE_VARIANT: Record<
	TimelineEvent["sourceType"],
	"amber" | "sky" | "sage" | "crimson" | "dim"
> = {
	DIGITAL: "sky",
	AUTOPSY: "amber",
	TOD: "sage",
	EVIDENCE: "crimson",
	INFERRED: "dim",
};

const SEVERITY_VARIANT: Record<
	TimelineInconsistency["severity"],
	"crimson" | "amber" | "dim"
> = {
	HIGH: "crimson",
	MEDIUM: "amber",
	LOW: "dim",
};

function formatEventTime(time: string): string {
	const d = new Date(time);
	if (!Number.isNaN(d.getTime())) return formatDateTime(time);
	return time; // descriptive estimate, e.g. "approx. 21:30"
}

export function TimelineReconstruction({
	caseId,
	existing,
	onGenerated,
}: TimelineReconstructionProps) {
	const toast = useToast();
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [result, setResult] = useState<TimelineReconstructionData | undefined>(
		existing,
	);

	async function handleGenerate() {
		setLoading(true);
		setError(null);
		try {
			const res = await fetch("/api/analyze/timeline", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ caseId }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			setResult(data);
			onGenerated?.(data);
			toast.success(
				`Timeline reconstructed — ${data.events?.length ?? 0} event(s), ${data.inconsistencies?.length ?? 0} inconsistenc${data.inconsistencies?.length === 1 ? "y" : "ies"} flagged.`,
			);
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(message);
			toast.error(`Timeline reconstruction failed: ${message}`);
		} finally {
			setLoading(false);
		}
	}

	async function handleReview(
		ev: TimelineEvent,
		nextStatus: "confirmed" | "rejected",
	) {
		if (!ev.key || !result) return;
		// Toggle back to pending if clicking the already-active state.
		const targetStatus = ev.status === nextStatus ? "pending" : nextStatus;

		// Optimistic update.
		setResult((prev) =>
			prev
				? {
						...prev,
						events: prev.events.map((e) =>
							e.key === ev.key ? { ...e, status: targetStatus } : e,
						),
					}
				: prev,
		);

		try {
			const res = await fetch("/api/analyze/timeline/review", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					caseId,
					eventKey: ev.key,
					eventTitle: ev.title,
					eventDescription: ev.description,
					status: targetStatus,
				}),
			});
			if (!res.ok) {
				const data = await res.json().catch(() => ({}));
				throw new Error(data.error ?? `HTTP ${res.status}`);
			}
			if (targetStatus !== "pending") {
				toast.success(
					`Event marked ${targetStatus}. Future reconstructions will respect this.`,
				);
			}
		} catch (err) {
			// Roll back on failure.
			setResult((prev) =>
				prev
					? {
							...prev,
							events: prev.events.map((e) =>
								e.key === ev.key ? { ...e, status: ev.status } : e,
							),
						}
					: prev,
			);
			toast.error(
				`Failed to save review: ${err instanceof Error ? err.message : "Unknown error"}`,
			);
		}
	}

	return (
		<section className="border border-border-DEFAULT bg-surface-1">
			<div className="px-4 py-2 border-b border-border-DEFAULT bg-surface-1 flex items-center gap-2 flex-wrap">
				<Sparkles size={13} strokeWidth={1.5} className="text-amber shrink-0" />
				<span className="font-mono text-xs uppercase tracking-widest text-muted">
					AI Event Reconstruction
				</span>
				<span className="font-mono text-[10px] text-dim">
					auto-updates on new autopsy / TOD / evidence / digital evidence
				</span>
				<div className="flex-1" />
				<button
					type="button"
					onClick={handleGenerate}
					disabled={loading}
					className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 bg-amber text-base border border-amber disabled:opacity-50 disabled:cursor-not-allowed"
					style={{ color: "var(--bg)", borderRadius: 0 }}
				>
					{loading
						? "Reconstructing..."
						: result
							? "Regenerate"
							: "Generate Timeline"}
				</button>
			</div>

			{error && (
				<div className="m-4 font-mono text-xs text-crimson border border-crimson px-3 py-2">
					ERROR: {error}
				</div>
			)}

			{!result && !loading && !error && (
				<div className="p-6 flex flex-col items-center justify-center gap-2 text-muted">
					<Sparkles size={24} strokeWidth={1} />
					<span className="font-mono text-xs uppercase tracking-widest">
						No reconstruction generated yet
					</span>
					<p className="text-xs text-muted text-center max-w-sm">
						Combines autopsy findings, TOD estimate, and digital evidence into a
						single probable event sequence.
					</p>
				</div>
			)}

			<AnimatePresence>
				{result && (
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						transition={{ duration: 0.2 }}
						className="p-4 flex flex-col gap-5"
					>
						{/* Summary */}
						<div>
							<div className="flex items-center justify-between mb-2">
								<span className="font-mono text-[10px] uppercase tracking-widest text-muted">
									Narrative Summary
								</span>
								<div className="flex items-center gap-2">
									<ConfidenceBar value={result.confidence} height={3} className="w-20" />
									<span className="font-mono text-xs text-dim">
										{Math.round(result.confidence)}%
									</span>
								</div>
							</div>
							<p className="text-sm text-data leading-relaxed">{result.summary}</p>
							<p className="font-mono text-[10px] text-muted mt-1">
								Generated {formatDateTime(result.generatedAt)}
							</p>
						</div>

						{/* Inconsistencies */}
						{result.inconsistencies.length > 0 && (
							<div>
								<span className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2 block">
									Flagged Inconsistencies ({result.inconsistencies.length})
								</span>
								<div className="flex flex-col gap-2">
									{result.inconsistencies.map((inc, i) => (
										<div
											key={i}
											className="flex items-start gap-2 bg-surface-2 border-l-2 border-crimson px-3 py-2"
										>
											<AlertTriangle
												size={13}
												strokeWidth={1.5}
												className="text-crimson shrink-0 mt-0.5"
											/>
											<div className="flex-1">
												<Badge variant={SEVERITY_VARIANT[inc.severity]} size="sm">
													{inc.severity}
												</Badge>
												<p className="text-xs text-data mt-1">{inc.description}</p>
											</div>
										</div>
									))}
								</div>
							</div>
						)}

						{/* Event sequence */}
						<div>
							<span className="font-mono text-[10px] uppercase tracking-widest text-muted mb-2 block">
								Reconstructed Sequence ({result.events.length})
							</span>
							{result.events.length === 0 ? (
								<p className="font-mono text-xs text-muted uppercase tracking-widest">
									No events reconstructed
								</p>
							) : (
								<ol className="flex flex-col">
									{result.events.map((ev, i) => (
										<motion.li
											key={ev.key ?? i}
											initial={{ opacity: 0, x: -8 }}
											animate={{ opacity: 1, x: 0 }}
											transition={{ duration: 0.2, delay: i * 0.02 }}
											className="relative pl-5 pb-4 border-l border-border-DEFAULT last:border-transparent last:pb-0"
										>
											<span
												className="absolute -left-[3.5px] top-1 w-1.5 h-1.5 rounded-full"
												style={{
													background:
														ev.status === "confirmed"
															? "var(--sage)"
															: ev.status === "rejected"
																? "var(--crimson)"
																: ev.sourceType === "INFERRED"
																	? "var(--dim)"
																	: "var(--amber)",
												}}
											/>
											<div className="flex items-start justify-between gap-2">
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 flex-wrap mb-0.5">
														<span className="font-mono text-[10px] text-dim whitespace-nowrap">
															{formatEventTime(ev.time)}
														</span>
														<Badge variant={SOURCE_VARIANT[ev.sourceType]} size="sm">
															{ev.sourceType}
														</Badge>
														{ev.status === "confirmed" && (
															<Badge variant="sage" size="sm">
																Confirmed
															</Badge>
														)}
														{ev.status === "rejected" && (
															<Badge variant="crimson" size="sm">
																Rejected
															</Badge>
														)}
													</div>
													<p
														className={`text-sm font-medium ${ev.status === "rejected" ? "text-muted line-through" : "text-data"}`}
													>
														{ev.title}
													</p>
													{ev.description && (
														<p className="text-xs text-muted mt-0.5">{ev.description}</p>
													)}
													<div className="flex items-center gap-2 mt-1">
														<ConfidenceBar value={ev.confidence} height={2} className="w-16" />
														<span className="font-mono text-[10px] text-dim">
															{Math.round(ev.confidence)}%
														</span>
														{ev.evidenceRef && (
															<span className="font-mono text-[10px] text-muted truncate">
																· {ev.evidenceRef}
															</span>
														)}
													</div>
												</div>
												<div className="flex items-center gap-1 shrink-0">
													<button
														type="button"
														title="Confirm this event"
														onClick={() => handleReview(ev, "confirmed")}
														className={`p-1 border ${
															ev.status === "confirmed"
																? "border-sage text-sage bg-sage-bg"
																: "border-border-DEFAULT text-dim hover:text-sage hover:border-sage"
														}`}
													>
														<Check size={12} strokeWidth={2} />
													</button>
													<button
														type="button"
														title="Reject this event"
														onClick={() => handleReview(ev, "rejected")}
														className={`p-1 border ${
															ev.status === "rejected"
																? "border-crimson text-crimson bg-crimson-bg"
																: "border-border-DEFAULT text-dim hover:text-crimson hover:border-crimson"
														}`}
													>
														<X size={12} strokeWidth={2} />
													</button>
												</div>
											</div>
										</motion.li>
									))}
								</ol>
							)}
						</div>
					</motion.div>
				)}
			</AnimatePresence>
		</section>
	);
}

export default TimelineReconstruction;
