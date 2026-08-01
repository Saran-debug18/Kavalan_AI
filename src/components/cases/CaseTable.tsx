"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import type { Case } from "@/types";
import { formatDate } from "@/lib/utils";
import { RiskBadge } from "@/components/ui/RiskBadge";
import { StatusStamp } from "@/components/ui/StatusStamp";

interface CaseTableProps {
	cases: Case[];
	onCaseClick?: (id: string) => void;
}

type SortKey = keyof Case;
type SortDir = "asc" | "desc";

const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
	{ key: "caseRef", label: "Case Ref" },
	{ key: "title", label: "Title" },
	{ key: "riskLevel", label: "Risk" },
	{ key: "status", label: "Status" },
	{ key: "victimName", label: "Victim" },
	{ key: "location", label: "Location" },
	{ key: "evidenceCount", label: "Evidence" },
	{ key: "dateOfIncident", label: "Date" },
	{ key: "assignedAgent", label: "Assignee" },
];

export function CaseTable({ cases, onCaseClick }: CaseTableProps) {
	const router = useRouter();
	const [sortKey, setSortKey] = useState<SortKey>("dateOfIncident");
	const [sortDir, setSortDir] = useState<SortDir>("desc");

	function handleHeaderClick(key: SortKey) {
		if (sortKey === key) {
			setSortDir((d) => (d === "asc" ? "desc" : "asc"));
		} else {
			setSortKey(key);
			setSortDir("asc");
		}
	}

	function handleRowClick(c: Case) {
		if (onCaseClick) {
			onCaseClick(c.id);
		} else {
			router.push(`/cases/${c.id}`);
		}
	}

	const sorted = [...cases].sort((a, b) => {
		const av = a[sortKey];
		const bv = b[sortKey];
		let cmp = 0;
		if (typeof av === "number" && typeof bv === "number") {
			cmp = av - bv;
		} else {
			cmp = String(av ?? "").localeCompare(String(bv ?? ""));
		}
		return sortDir === "asc" ? cmp : -cmp;
	});

	if (cases.length === 0) {
		return (
			<div className="flex items-center justify-center py-20">
				<span className="font-mono text-sm text-muted uppercase tracking-widest">
					No Cases Found
				</span>
			</div>
		);
	}

	return (
		<div className="w-full">
			{/* Mobile card list */}
			<div className="flex flex-col gap-2 md:hidden">
				{sorted.map((c, i) => (
					<motion.div
						key={c.id}
						initial={{ opacity: 0, y: 8 }}
						animate={{ opacity: 1, y: 0 }}
						transition={{ duration: 0.25, ease: "easeOut", delay: i * 0.02 }}
						onClick={() => handleRowClick(c)}
						className="border border-border-DEFAULT bg-surface-1 active:bg-surface-2 p-3 flex flex-col gap-2"
					>
						<div className="flex items-center justify-between gap-2">
							<span className="font-mono text-xs text-amber-dim">
								{c.caseRef}
							</span>
							<div className="flex items-center gap-2 shrink-0">
								<RiskBadge level={c.riskLevel} score={c.riskScore} />
							</div>
						</div>
						<span className="text-sm text-data leading-snug">{c.title}</span>
						<div className="flex items-center justify-between gap-2">
							<span className="text-xs text-muted truncate">
								{c.victimName || "—"} · {c.location || "—"}
							</span>
							<StatusStamp status={c.status} />
						</div>
						<div className="flex items-center justify-between font-mono text-xs text-dim">
							<span>{formatDate(c.dateOfIncident)}</span>
							<span>{c.evidenceCount} evidence</span>
							<span className="truncate max-w-[40%]">{c.assignedAgent}</span>
						</div>
					</motion.div>
				))}
			</div>

			{/* Desktop table */}
			<div className="hidden md:block w-full overflow-x-auto">
			<table className="w-full border-collapse">
				<thead>
					<tr className="border-b border-border-DEFAULT">
						{COLUMNS.map((col) => (
							<th
								key={col.key}
								onClick={() => handleHeaderClick(col.key)}
								className="px-3 py-2 text-left font-mono text-xs uppercase tracking-wider text-muted cursor-pointer select-none whitespace-nowrap"
							>
								{col.label}
								{sortKey === col.key && (
									<span className="ml-1 text-amber">
										{sortDir === "asc" ? "↑" : "↓"}
									</span>
								)}
							</th>
						))}
					</tr>
				</thead>
				<tbody>
					{sorted.map((c, i) => (
						<motion.tr
							key={c.id}
							initial={{ opacity: 0, y: 8 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.25, ease: "easeOut", delay: i * 0.02 }}
							onClick={() => handleRowClick(c)}
							className="border-t border-border-DEFAULT hover:bg-surface-2 cursor-pointer"
						>
							<td className="px-3 py-2 font-mono text-xs text-amber-dim whitespace-nowrap">
								{c.caseRef}
							</td>
							<td className="px-3 py-2 text-sm text-data max-w-[200px] truncate">
								{c.title}
							</td>
							<td className="px-3 py-2 whitespace-nowrap">
								<RiskBadge level={c.riskLevel} score={c.riskScore} />
							</td>
							<td className="px-3 py-2 whitespace-nowrap">
								<StatusStamp status={c.status} />
							</td>
							<td className="px-3 py-2 text-sm text-data whitespace-nowrap">
								{c.victimName}
							</td>
							<td className="px-3 py-2 text-sm text-muted max-w-[140px] truncate">
								{c.location}
							</td>
							<td className="px-3 py-2 font-mono text-xs text-muted text-right">
								{c.evidenceCount}
							</td>
							<td className="px-3 py-2 font-mono text-xs text-muted whitespace-nowrap">
								{formatDate(c.dateOfIncident)}
							</td>
							<td className="px-3 py-2 text-sm text-muted whitespace-nowrap">
								{c.assignedAgent}
							</td>
						</motion.tr>
					))}
				</tbody>
			</table>
			</div>
		</div>
	);
}

export default CaseTable;
