"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { RiskGauge } from "@/components/cases/RiskGauge";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AddEvidenceForm } from "@/components/cases/AddEvidenceForm";
import { useToast } from "@/components/ui/Toast";
import { CardSkeleton } from "@/components/ui/Skeleton";
import { downloadText } from "@/lib/export";
import type {
	Case,
	Evidence,
	CaseActivity,
	AutopsyReport,
	TodEstimate,
} from "@/types";

interface CaseDetail extends Case {
	evidence: Evidence[];
	activities: CaseActivity[];
	autopsyReports?: AutopsyReport[];
	todEstimates?: TodEstimate[];
}

function DetailRow({
	label,
	value,
}: {
	label: string;
	value: string | undefined;
}) {
	return (
		<div>
			<p
				className="font-mono text-xs uppercase mb-1"
				style={{ color: "var(--text-dim)", letterSpacing: "0.08em" }}
			>
				{label}
			</p>
			<p className="font-mono text-sm" style={{ color: "var(--text-data)" }}>
				{value ?? "—"}
			</p>
		</div>
	);
}

function ConfidenceBar({ value }: { value: number }) {
	const pct = Math.max(0, Math.min(100, Math.round(value * 100)));
	const color =
		pct >= 80 ? "var(--low)" : pct >= 50 ? "var(--medium)" : "var(--critical)";
	return (
		<div className="flex items-center gap-2">
			<div
				style={{
					width: "60px",
					height: "4px",
					background: "var(--bg-surface-3)",
					borderRadius: "2px",
					overflow: "hidden",
				}}
			>
				<div style={{ width: `${pct}%`, height: "100%", background: color }} />
			</div>
			<span className="font-mono text-xs" style={{ color: "var(--text-dim)" }}>
				{pct}%
			</span>
		</div>
	);
}

export default function CaseOverviewPage() {
	const params = useParams<{ id: string }>();
	const id = params?.id;
	const toast = useToast();

	const [caseData, setCaseData] = useState<CaseDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [analyzingRisk, setAnalyzingRisk] = useState(false);

	const loadCase = async () => {
		if (!id) return;
		try {
			const res = await fetch(`/api/cases/${id}`);
			if (!res.ok) throw new Error("Failed to load case");
			const data = await res.json();
			setCaseData(data);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		loadCase();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	const runRiskAnalysis = async () => {
		if (!id) return;
		setAnalyzingRisk(true);
		try {
			const res = await fetch(`/api/analyze/risk`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ caseId: id }),
			});
			if (!res.ok) throw new Error("Risk analysis failed");
			const result = await res.json();
			if (caseData) {
				setCaseData((prev) =>
					prev
						? {
								...prev,
								riskScore: result.riskSummary?.overall ?? prev.riskScore,
								riskLevel: result.riskSummary?.tier ?? prev.riskLevel,
							}
						: prev,
				);
			}
			toast.success(
				`Risk analysis complete — ${result.riskSummary?.tier ?? "score"} ${result.riskSummary?.overall ?? ""}.`,
			);
		} catch (err) {
			console.error("Risk analysis error:", err);
			toast.error("Risk analysis failed.");
		} finally {
			setAnalyzingRisk(false);
		}
	};

	const formatDate = (d?: string) => {
		if (!d) return "—";
		try {
			return format(new Date(d), "dd MMM yyyy");
		} catch {
			return d;
		}
	};

	const exportSummary = () => {
		if (!caseData) return;
		const lines: string[] = [];
		lines.push(`KAVALAN CASE SUMMARY`);
		lines.push(`=`.repeat(60));
		lines.push(`Case Ref:        ${caseData.caseRef}`);
		lines.push(`Title:           ${caseData.title}`);
		lines.push(`Status:          ${caseData.status}`);
		lines.push(`Risk:            ${caseData.riskLevel} (${caseData.riskScore}/100)`);
		lines.push(`Victim:          ${caseData.victimName || "—"}`);
		lines.push(`Location:        ${caseData.location || "—"}`);
		lines.push(`Date of Incident:${formatDate(caseData.dateOfIncident)}`);
		lines.push(`Date Opened:     ${formatDate(caseData.dateCreated)}`);
		lines.push(`Assigned Agent:  ${caseData.assignedAgent || "—"}`);
		lines.push("");
		lines.push(`DESCRIPTION`);
		lines.push(`-`.repeat(60));
		lines.push(caseData.description || "No description provided.");
		lines.push("");

		const autopsy = caseData.autopsyReports?.[0];
		if (autopsy) {
			lines.push(`AUTOPSY ANALYSIS`);
			lines.push(`-`.repeat(60));
			lines.push(`Cause of Death:      ${autopsy.causeOfDeath}`);
			lines.push(`Manner of Death:     ${autopsy.mannerOfDeath}`);
			lines.push(`Postmortem Interval: ${autopsy.postmortemInterval}`);
			lines.push(`Toxicology:          ${autopsy.toxicologyFindings || "—"}`);
			lines.push(`Confidence:          ${autopsy.confidence}%`);
			lines.push("");
		}

		const tod = caseData.todEstimates?.[0];
		if (tod) {
			lines.push(`TIME OF DEATH ESTIMATE`);
			lines.push(`-`.repeat(60));
			lines.push(`Window:      ${tod.estimatedTodEarliest} — ${tod.estimatedTodLatest}`);
			lines.push(`Central:     ${tod.centralEstimate || "—"}`);
			lines.push(`Confidence:  ${tod.confidenceLevel}%`);
			lines.push("");
		}

		lines.push(`EVIDENCE INVENTORY (${caseData.evidence?.length ?? 0})`);
		lines.push(`-`.repeat(60));
		for (const ev of caseData.evidence ?? []) {
			lines.push(
				`[${ev.catalogRef}] ${ev.type} — ${ev.description} (collected ${formatDate(ev.collectedAt)} by ${ev.analyst})`,
			);
		}
		lines.push("");

		lines.push(`RECENT ACTIVITY`);
		lines.push(`-`.repeat(60));
		for (const act of (caseData.activities ?? []).slice(0, 20)) {
			lines.push(`${formatDate(act.createdAt)} · ${act.agent} — ${act.description}`);
		}
		lines.push("");
		lines.push(`Generated ${new Date().toISOString()} by KAVALAN Forensic Intelligence.`);

		downloadText(`${caseData.caseRef}-summary.txt`, lines.join("\n"));
		toast.success(`Exported ${caseData.caseRef}-summary.txt`);
	};

	if (loading) {
		return (
			<div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
				<CardSkeleton className="lg:col-span-2" />
				<CardSkeleton className="lg:col-span-1" />
			</div>
		);
	}

	if (error || !caseData) {
		return (
			<div className="flex items-center justify-center h-64">
				<span
					className="font-mono text-sm"
					style={{ color: "var(--critical)" }}
				>
					{error ?? "CASE NOT FOUND"}
				</span>
			</div>
		);
	}

	const tags: string[] = (() => {
		try {
			return JSON.parse(caseData.tags || "[]");
		} catch {
			return [];
		}
	})();

	const recentActivities = (caseData.activities ?? []).slice(0, 5);

	return (
		<motion.div
			className="p-4 md:p-6"
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			<div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
				{/* Left: Case Details */}
				<div className="lg:col-span-2 flex flex-col gap-6">
					{/* Case Details */}
					<section>
						<h3
							className="font-mono text-xs uppercase mb-4"
							style={{
								color: "var(--text-dim)",
								letterSpacing: "0.1em",
								borderBottom: "1px solid var(--border)",
								paddingBottom: "8px",
							}}
						>
							CASE DETAILS
						</h3>
						<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
							<DetailRow label="Victim" value={caseData.victimName} />
							<DetailRow label="Location" value={caseData.location} />
							<DetailRow
								label="Date of Incident"
								value={formatDate(caseData.dateOfIncident)}
							/>
							<DetailRow
								label="Assigned Agent"
								value={caseData.assignedAgent}
							/>
							<DetailRow
								label="Date Opened"
								value={formatDate(caseData.dateCreated)}
							/>
							<DetailRow label="Status" value={caseData.status} />
						</div>
					</section>

					{/* Description */}
					<section>
						<h3
							className="font-mono text-xs uppercase mb-3"
							style={{
								color: "var(--text-dim)",
								letterSpacing: "0.1em",
								borderBottom: "1px solid var(--border)",
								paddingBottom: "8px",
							}}
						>
							DESCRIPTION
						</h3>
						<p
							className="font-sans text-sm leading-relaxed"
							style={{ color: "var(--text-data)" }}
						>
							{caseData.description || "No description provided."}
						</p>
					</section>

					{/* Evidence Inventory */}
					<section>
						<h3
							className="font-mono text-xs uppercase mb-3"
							style={{
								color: "var(--text-dim)",
								letterSpacing: "0.1em",
								borderBottom: "1px solid var(--border)",
								paddingBottom: "8px",
							}}
						>
							EVIDENCE INVENTORY
						</h3>
						{id && (
							<AddEvidenceForm
								caseId={id as string}
								onCreated={() => loadCase()}
							/>
						)}
						{!caseData.evidence || caseData.evidence.length === 0 ? (
							<p
								className="font-mono text-xs"
								style={{ color: "var(--text-muted)" }}
							>
								NO EVIDENCE CATALOGUED
							</p>
						) : (
							<div
								style={{
									border: "1px solid var(--border)",
									borderRadius: "4px",
									overflow: "auto",
								}}
							>
								<table style={{ width: "100%", minWidth: "720px", borderCollapse: "collapse" }}>
									<thead>
										<tr style={{ background: "var(--bg-surface-2)" }}>
											{[
												"CATALOG REF",
												"TYPE",
												"DESCRIPTION",
												"IMAGE",
												"COLLECTED",
												"ANALYST",
												"CONFIDENCE",
											].map((h) => (
												<th
													key={h}
													style={{
														padding: "8px 12px",
														textAlign: "left",
														fontFamily: "var(--font-mono, monospace)",
														fontSize: "10px",
														letterSpacing: "0.08em",
														color: "var(--text-muted)",
														borderBottom: "1px solid var(--border)",
													}}
												>
													{h}
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{caseData.evidence.map((ev, i) => (
											<tr
												key={ev.id}
												style={{
													background:
														i % 2 === 0 ? "var(--bg-surface-1)" : "transparent",
													borderBottom:
														i < caseData.evidence.length - 1
															? "1px solid var(--border-subtle)"
															: "none",
												}}
											>
												<td
													style={{
														padding: "8px 12px",
														fontFamily: "var(--font-mono, monospace)",
														fontSize: "12px",
														color: "var(--amber-dim)",
													}}
												>
													{ev.catalogRef}
												</td>
												<td style={{ padding: "8px 12px" }}>
													<Badge variant="dim">{ev.type}</Badge>
												</td>
												<td
													style={{
														padding: "8px 12px",
														fontFamily: "var(--font-sans)",
														fontSize: "12px",
														color: "var(--text-data)",
														maxWidth: "200px",
													}}
												>
													{ev.description}
												</td>
												<td style={{ padding: "8px 12px" }}>
													{ev.imagePath ? (
														/* eslint-disable-next-line @next/next/no-img-element */
														<a
															href={`/api/evidence/${ev.id}/image`}
															target="_blank"
															rel="noreferrer"
															title="Open full-size image"
														>
															<img
																src={`/api/evidence/${ev.id}/image`}
																alt="Evidence"
																style={{
																	width: 48,
																	height: 48,
																	objectFit: "cover",
																	border: "1px solid var(--border)",
																	display: "block",
																}}
															/>
														</a>
													) : (
														<span
															className="font-mono"
															style={{
																fontSize: 10,
																color: "var(--text-muted)",
															}}
														>
															—
														</span>
													)}
												</td>
												<td
													style={{
														padding: "8px 12px",
														fontFamily: "var(--font-mono, monospace)",
														fontSize: "11px",
														color: "var(--text-dim)",
														whiteSpace: "nowrap",
													}}
												>
													{formatDate(ev.collectedAt)}
												</td>
												<td
													style={{
														padding: "8px 12px",
														fontFamily: "var(--font-mono, monospace)",
														fontSize: "11px",
														color: "var(--text-dim)",
													}}
												>
													{ev.analyst}
												</td>
												<td style={{ padding: "8px 12px" }}>
													<ConfidenceBar value={ev.confidence} />
												</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						)}
					</section>

					{/* Tags */}
					{tags.length > 0 && (
						<section>
							<div className="flex flex-wrap gap-2 mt-1">
								{tags.map((tag) => (
									<Badge key={tag} variant="dim">
										{tag}
									</Badge>
								))}
							</div>
						</section>
					)}
				</div>

				{/* Right: Risk Gauge + Quick Actions + Activity */}
				<div className="lg:col-span-1 flex flex-col gap-6">
					{/* Risk Gauge */}
					<div className="flex flex-col items-center gap-3">
						<RiskGauge score={caseData.riskScore} size={180} />
						<button
							onClick={runRiskAnalysis}
							disabled={analyzingRisk}
							style={{
								fontFamily: "var(--font-mono, monospace)",
								fontSize: "11px",
								letterSpacing: "0.08em",
								color: analyzingRisk ? "var(--text-muted)" : "var(--amber)",
								background: "transparent",
								border: "1px solid var(--amber-border)",
								padding: "4px 12px",
								borderRadius: "3px",
								cursor: analyzingRisk ? "not-allowed" : "pointer",
							}}
						>
							{analyzingRisk ? "ANALYZING..." : "RISK ANALYSIS"}
						</button>
					</div>

					{/* Quick Actions */}
					<section>
						<h3
							className="font-mono text-xs uppercase mb-3"
							style={{
								color: "var(--text-dim)",
								letterSpacing: "0.1em",
								borderBottom: "1px solid var(--border)",
								paddingBottom: "8px",
							}}
						>
							QUICK ACTIONS
						</h3>
						<div className="flex flex-col gap-2">
							{[
								{
									label: "ANALYZE AUTOPSY REPORT",
									href: `/cases/${id}/autopsy`,
								},
								{
									label: "ESTIMATE TIME OF DEATH",
									href: `/cases/${id}/tod`,
								},
								{
									label: "CORRELATE DIGITAL EVIDENCE",
									href: `/cases/${id}/digital`,
								},
								{
									label: "VIEW TIMELINE",
									href: `/cases/${id}/timeline`,
								},
							].map((action) => (
								<Button
									key={action.label}
									variant="secondary"
									href={action.href}
								>
									{action.label}
								</Button>
							))}
							<Button variant="secondary" onClick={exportSummary}>
								EXPORT CASE SUMMARY
							</Button>
						</div>
					</section>

					{/* Recent Activity */}
					{recentActivities.length > 0 && (
						<section>
							<h3
								className="font-mono text-xs uppercase mb-3"
								style={{
									color: "var(--text-dim)",
									letterSpacing: "0.1em",
									borderBottom: "1px solid var(--border)",
									paddingBottom: "8px",
								}}
							>
								RECENT ACTIVITY
							</h3>
							<div className="flex flex-col gap-2">
								{recentActivities.map((act) => (
									<div key={act.id} className="flex flex-col gap-0.5">
										<p
											className="font-sans text-xs"
											style={{ color: "var(--text-data)" }}
										>
											{act.description}
										</p>
										<p
											className="font-mono text-xs"
											style={{ color: "var(--text-muted)" }}
										>
											{act.agent} · {formatDate(act.createdAt)}
										</p>
									</div>
								))}
							</div>
						</section>
					)}
				</div>
			</div>
		</motion.div>
	);
}
