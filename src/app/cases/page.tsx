"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import TopBar from "@/components/layout/TopBar";
import CaseTable from "@/components/cases/CaseTable";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { CasesPageSkeleton } from "@/components/ui/Skeleton";
import { downloadCsv } from "@/lib/export";
import type { Case, CaseStatus, RiskLevel } from "@/types";

const EXPORT_COLUMNS = [
	"caseRef",
	"title",
	"status",
	"riskLevel",
	"riskScore",
	"victimName",
	"location",
	"dateOfIncident",
	"dateCreated",
	"assignedAgent",
	"evidenceCount",
];

const STATUS_FILTERS: Array<"ALL" | CaseStatus> = [
	"ALL",
	"OPEN",
	"ACTIVE",
	"PENDING",
	"CLOSED",
	"COLD",
];
const RISK_FILTERS: Array<"ALL" | RiskLevel> = [
	"ALL",
	"CRITICAL",
	"HIGH",
	"MEDIUM",
	"LOW",
];

export default function CasesPage() {
	const router = useRouter();
	const toast = useToast();
	const [cases, setCases] = useState<Case[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [statusFilter, setStatusFilter] = useState<"ALL" | CaseStatus>("ALL");
	const [riskFilter, setRiskFilter] = useState<"ALL" | RiskLevel>("ALL");

	useEffect(() => {
		const load = async () => {
			try {
				const res = await fetch("/api/cases");
				if (!res.ok) throw new Error("Failed to fetch cases");
				const data = await res.json();
				setCases(data.cases ?? data);
			} catch (err) {
				setError(err instanceof Error ? err.message : "Unknown error");
			} finally {
				setLoading(false);
			}
		};
		load();
	}, []);

	const filtered = cases.filter((c) => {
		const matchStatus = statusFilter === "ALL" || c.status === statusFilter;
		const matchRisk = riskFilter === "ALL" || c.riskLevel === riskFilter;
		return matchStatus && matchRisk;
	});

	function handleExportCsv() {
		const stamp = new Date().toISOString().slice(0, 10);
		const filename = `kavalan-cases-${stamp}.csv`;
		downloadCsv(filename, filtered as unknown as Record<string, unknown>[], EXPORT_COLUMNS);
		toast.success(`Exported ${filtered.length} case${filtered.length === 1 ? "" : "s"} to ${filename}.`);
	}

	const filterBtnStyle = (active: boolean) => ({
		background: active ? "var(--amber-bg)" : "transparent",
		color: active ? "var(--amber)" : "var(--text-dim)",
		border: `1px solid ${active ? "var(--amber-border)" : "var(--border)"}`,
		padding: "6px 12px",
		borderRadius: "3px",
		minHeight: "32px",
		fontFamily: "var(--font-mono, monospace)",
		fontSize: "11px",
		cursor: "pointer",
		letterSpacing: "0.05em",
		textTransform: "uppercase" as const,
	});

	if (loading) {
		return (
			<>
				<TopBar title="ACTIVE CASES" subtitle="CASE REGISTRY" />
				<CasesPageSkeleton />
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
				title="ACTIVE CASES"
				subtitle="CASE REGISTRY"
				actions={
					<div className="flex items-center gap-2">
						<Button
							variant="secondary"
							size="sm"
							onClick={handleExportCsv}
							className="hidden sm:inline-flex"
						>
							Export CSV
						</Button>
						<Button variant="primary" href="/cases/new">
							NEW CASE
						</Button>
					</div>
				}
			/>

			<motion.div
				className="p-4 md:p-6"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2, ease: "easeOut" }}
			>
				{/* Filter Bar */}
				<div className="mb-4 flex flex-wrap items-center gap-2">
					<div className="flex items-center gap-1">
						<span
							className="font-mono text-xs mr-2"
							style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}
						>
							STATUS:
						</span>
						{STATUS_FILTERS.map((s) => (
							<button
								key={s}
								style={filterBtnStyle(statusFilter === s)}
								onClick={() => setStatusFilter(s)}
							>
								{s}
							</button>
						))}
					</div>
					<div
						style={{
							width: "1px",
							height: "20px",
							background: "var(--border)",
							margin: "0 4px",
						}}
					/>
					<div className="flex items-center gap-1">
						<span
							className="font-mono text-xs mr-2"
							style={{ color: "var(--text-muted)", letterSpacing: "0.08em" }}
						>
							RISK:
						</span>
						{RISK_FILTERS.map((r) => (
							<button
								key={r}
								style={filterBtnStyle(riskFilter === r)}
								onClick={() => setRiskFilter(r)}
							>
								{r}
							</button>
						))}
					</div>
				</div>

				{/* Case Count */}
				<p
					className="font-mono text-xs mb-2"
					style={{ color: "var(--text-dim)" }}
				>
					SHOWING {filtered.length} CASE{filtered.length !== 1 ? "S" : ""}
				</p>

				{/* Case Table */}
				<CaseTable
					cases={filtered}
					onCaseClick={(id) => router.push(`/cases/${id}`)}
				/>
			</motion.div>
		</>
	);
}
