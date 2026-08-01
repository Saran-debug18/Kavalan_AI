"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import TopBar from "@/components/layout/TopBar";
import { DashboardSkeleton } from "@/components/ui/Skeleton";
import StatsStrip from "@/components/dashboard/StatsStrip";
import RiskDistribution from "@/components/dashboard/RiskDistribution";
import RecentActivity from "@/components/dashboard/RecentActivity";
import CasePipeline from "@/components/dashboard/CasePipeline";
import { Button } from "@/components/ui/Button";
import type { Case, CaseActivity } from "@/types";

export default function DashboardPage() {
	const [cases, setCases] = useState<Case[]>([]);
	const [activities, setActivities] = useState<CaseActivity[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const load = async () => {
			try {
				const [casesRes, activitiesRes] = await Promise.all([
					fetch("/api/cases"),
					fetch("/api/activities"),
				]);
				if (!casesRes.ok) throw new Error("Failed to fetch cases");
				const data = await casesRes.json();
				setCases(Array.isArray(data) ? data : (data.cases ?? []));
				if (activitiesRes.ok) {
					const acts = await activitiesRes.json();
					setActivities(Array.isArray(acts) ? acts : []);
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		};
		load();
	}, []);

	const highRiskCases = cases
		.filter((c) => c.riskLevel === "CRITICAL" || c.riskLevel === "HIGH")
		.sort((a, b) => b.riskScore - a.riskScore)
		.slice(0, 3);

	if (loading) {
		return (
			<>
				<TopBar title="INVESTIGATION HUB" subtitle="KAVALAN FORENSIC INTELLIGENCE" />
				<DashboardSkeleton />
			</>
		);
	}

	if (error) {
		return (
			<div className="flex items-center justify-center h-64">
				<span
					className="font-mono text-sm"
					style={{ color: "var(--critical)" }}
				>
					ERROR: {error}
				</span>
			</div>
		);
	}

	return (
		<>
			<TopBar
				title="INVESTIGATION HUB"
				subtitle="KAVALAN FORENSIC INTELLIGENCE"
				actions={
					<Button variant="primary" href="/cases/new">
						NEW CASE
					</Button>
				}
			/>

			<motion.div
				className="p-4 md:p-6"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2, ease: "easeOut" }}
			>
				{/* Row 1: Stats Strip */}
				<StatsStrip cases={cases} />

				{/* Row 2: Risk Distribution + Case Pipeline */}
				<div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-1">
						<RiskDistribution cases={cases} />
					</div>
					<div className="lg:col-span-2">
						<CasePipeline cases={cases} />
					</div>
				</div>

				{/* Row 3: Recent Activity + High-Risk Cases */}
				<div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
					<div className="lg:col-span-2">
						<RecentActivity activities={activities} cases={cases} />
					</div>
					<div className="lg:col-span-1">
						<h3
							className="font-mono text-xs uppercase mb-3"
							style={{ color: "var(--text-dim)", letterSpacing: "0.1em" }}
						>
							ACTIVE HIGH-RISK CASES
						</h3>
						<div
							className="rounded"
							style={{ border: "1px solid var(--border)" }}
						>
							{highRiskCases.length === 0 ? (
								<div
									className="p-4 font-mono text-xs"
									style={{ color: "var(--text-muted)" }}
								>
									NO HIGH-RISK CASES
								</div>
							) : (
								highRiskCases.map((c, idx) => (
									<Link key={c.id} href={`/cases/${c.id}`}>
										<div
											className="p-4 flex items-center justify-between hover:opacity-80 transition-opacity"
											style={{
												background: "var(--bg-surface-1)",
												borderBottom:
													idx < highRiskCases.length - 1
														? "1px solid var(--border)"
														: "none",
											}}
										>
											<div className="flex flex-col gap-1">
												<span
													className="font-mono text-xs"
													style={{ color: "var(--amber-dim)" }}
												>
													{c.caseRef}
												</span>
												<span
													className="font-sans text-sm"
													style={{ color: "var(--text-data)" }}
												>
													{c.title}
												</span>
											</div>
											<span
												className="font-mono text-sm font-bold"
												style={{
													color:
														c.riskLevel === "CRITICAL"
															? "var(--critical)"
															: "var(--high)",
												}}
											>
												{c.riskScore}
											</span>
										</div>
									</Link>
								))
							)}
						</div>
					</div>
				</div>
			</motion.div>
		</>
	);
}
