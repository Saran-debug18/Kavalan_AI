"use client";

import { useEffect, useState } from "react";
import { useParams, usePathname } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/layout/TopBar";
import { CaseWorkspaceSkeleton } from "@/components/ui/Skeleton";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { CaseStatusControl } from "@/components/cases/CaseStatusControl";
import { useToast } from "@/components/ui/Toast";
import type { Case, TimelineReconstruction } from "@/types";

const TABS = [
	{ label: "OVERVIEW", path: "" },
	{ label: "AUTOPSY", path: "/autopsy" },
	{ label: "TIME OF DEATH", path: "/tod" },
	{ label: "DIGITAL EVIDENCE", path: "/digital" },
	{ label: "RELATIONSHIP MAP", path: "/graph" },
	{ label: "TIMELINE", path: "/timeline" },
];

const SEEN_KEY_PREFIX = "kavalan-seen-tl-";

interface CaseWithTimeline extends Case {
	timelineReconstructions?: TimelineReconstruction[];
}

export default function CaseWorkspaceLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const params = useParams<{ id: string }>();
	const pathname = usePathname();
	const id = params?.id;
	const toast = useToast();

	const [caseData, setCaseData] = useState<CaseWithTimeline | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!id) return;
		const load = async () => {
			try {
				const res = await fetch(`/api/cases/${id}`);
				if (!res.ok) throw new Error("Case not found");
				const data: CaseWithTimeline = await res.json();
				setCaseData(data);

				// Proactive alert: surface newly-generated HIGH-severity
				// inconsistencies the moment an investigator lands on any tab of
				// this case, not just when they happen to open Timeline. Only
				// fires once per reconstruction id (tracked in localStorage) so
				// it doesn't repeat on every navigation.
				const latest = data.timelineReconstructions?.[0];
				if (latest) {
					const highSeverity = latest.inconsistencies.filter(
						(i) => i.severity === "HIGH",
					);
					const seenKey = `${SEEN_KEY_PREFIX}${id}`;
					const lastSeenId =
						typeof window !== "undefined"
							? window.localStorage.getItem(seenKey)
							: null;
					if (highSeverity.length > 0 && latest.id !== lastSeenId) {
						toast.error(
							`${highSeverity.length} HIGH-severity timeline inconsistenc${highSeverity.length === 1 ? "y" : "ies"} flagged: ${highSeverity[0].description}`,
						);
					}
					if (typeof window !== "undefined") {
						window.localStorage.setItem(seenKey, latest.id);
					}
				}
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		};
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [id]);

	const latestReconstruction = caseData?.timelineReconstructions?.[0];
	const hasHighSeverity =
		(latestReconstruction?.inconsistencies ?? []).some(
			(i) => i.severity === "HIGH",
		) ?? false;

	if (loading) {
		return <CaseWorkspaceSkeleton />;
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

	return (
		<>
			<TopBar
				title={caseData.caseRef}
				subtitle={caseData.title}
				actions={
					<div className="flex items-center gap-2">
						<RiskBadge level={caseData.riskLevel} score={caseData.riskScore} />
						<CaseStatusControl
							caseId={caseData.id}
							status={caseData.status}
							onChanged={(next) =>
								setCaseData((c) => (c ? { ...c, status: next } : c))
							}
						/>
					</div>
				}
			/>

			{/* Tab navigation */}
			<div
				style={{
					background: "var(--bg-surface-1)",
					borderBottom: "1px solid var(--border)",
				}}
			>
				<nav className="flex px-4 md:px-6 overflow-x-auto" style={{ gap: 0 }}>
					{TABS.map((tab) => {
						const href = `/cases/${id}${tab.path}`;
						const isActive =
							tab.path === ""
								? pathname === `/cases/${id}`
								: pathname?.startsWith(href);
						return (
							<Link
								key={tab.label}
								href={href}
								style={{
									display: "inline-flex",
									alignItems: "center",
									gap: "6px",
									padding: "10px 12px",
									fontFamily: "var(--font-mono, monospace)",
									fontSize: "11px",
									letterSpacing: "0.08em",
									textTransform: "uppercase",
									color: isActive ? "var(--amber)" : "var(--text-dim)",
									borderBottom: isActive
										? "2px solid var(--amber)"
										: "2px solid transparent",
									textDecoration: "none",
									whiteSpace: "nowrap",
									transition: "color 0.15s",
								}}
							>
								{tab.label}
								{tab.path === "/timeline" && hasHighSeverity && (
									<span
										title="HIGH-severity inconsistency flagged"
										style={{
											width: 6,
											height: 6,
											borderRadius: "50%",
											background: "var(--crimson)",
											display: "inline-block",
										}}
									/>
								)}
							</Link>
						);
					})}
				</nav>
			</div>

			{/* Tab content */}
			{children}
		</>
	);
}
