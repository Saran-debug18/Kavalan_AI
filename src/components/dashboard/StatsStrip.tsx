"use client";

import type { Case } from "@/types";
import { cn } from "@/lib/utils";

interface StatsStripProps {
	cases: Case[];
}

function computeStats(cases: Case[]) {
	const now = new Date();
	const thisMonth = now.getMonth();
	const thisYear = now.getFullYear();

	const totalCases = cases.length;
	const activeCases = cases.filter((c) => c.status === "ACTIVE").length;
	const criticalCases = cases.filter((c) => c.riskLevel === "CRITICAL").length;
	const avgRiskScore =
		totalCases > 0
			? Math.round(
					cases.reduce((sum, c) => sum + (c.riskScore ?? 0), 0) / totalCases,
				)
			: 0;
	const closedThisMonth = cases.filter((c) => {
		if (c.status !== "CLOSED") return false;
		const d = new Date(c.dateCreated);
		return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
	}).length;

	return {
		totalCases,
		activeCases,
		criticalCases,
		avgRiskScore,
		closedThisMonth,
	};
}

export default function StatsStrip({ cases }: StatsStripProps) {
	const {
		totalCases,
		activeCases,
		criticalCases,
		avgRiskScore,
		closedThisMonth,
	} = computeStats(cases);

	const cells = [
		{ label: "TOTAL CASES", value: String(totalCases), highlight: false },
		{ label: "ACTIVE", value: String(activeCases), highlight: false },
		{
			label: "CRITICAL",
			value: String(criticalCases),
			highlight: criticalCases > 0,
		},
		{ label: "AVG RISK SCORE", value: String(avgRiskScore), highlight: false },
		{
			label: "CLOSED THIS MONTH",
			value: String(closedThisMonth),
			highlight: false,
		},
	] as const;

	return (
		<div className="grid grid-cols-2 sm:flex w-full border border-border-DEFAULT bg-surface-1">
			{cells.map((cell, i) => (
				<div
					key={cell.label}
					className={cn(
						"flex sm:flex-1 flex-col justify-center gap-1 px-4 sm:px-6 py-3 sm:py-4 border-border-DEFAULT",
						i % 2 === 0 ? "border-r" : "",
						i < cells.length - 2 && "border-b sm:border-b-0",
						i === cells.length - 1 && "col-span-2 sm:col-span-1 border-r-0",
						i < cells.length - 1 && "sm:border-r",
					)}
				>
					<span className="font-mono text-[10px] sm:text-xs uppercase tracking-wider text-dim">
						{cell.label}
					</span>
					<span
						className={cn(
							"font-mono text-xl sm:text-2xl leading-none tabular-nums",
							cell.highlight ? "text-crimson" : "text-data",
						)}
					>
						{cell.value}
					</span>
				</div>
			))}
		</div>
	);
}
