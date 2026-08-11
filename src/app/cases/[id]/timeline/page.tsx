"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { TimelineRail } from "@/components/timeline/TimelineRail";
import { TimelineReconstruction } from "@/components/timeline/TimelineReconstruction";
import type {
	Case,
	DigitalEvidence,
	AutopsyReport,
	TodEstimate,
	TimelineReconstruction as TimelineReconstructionData,
} from "@/types";

interface CaseDetail extends Case {
	digitalEvidence: DigitalEvidence[];
	autopsyReports?: AutopsyReport[];
	todEstimates?: TodEstimate[];
	timelineReconstructions?: TimelineReconstructionData[];
}

export default function TimelinePage() {
	const params = useParams<{ id: string }>();
	const id = params?.id ?? "";

	const [caseData, setCaseData] = useState<CaseDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!id) return;
		const load = async () => {
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
		load();
	}, [id]);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<span
					className="font-mono text-sm"
					style={{ color: "var(--text-dim)" }}
				>
					LOADING...
				</span>
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

	const digital = caseData.digitalEvidence ?? [];
	const timestamps = digital
		.map((d) => d.timestamp)
		.filter(Boolean)
		.sort();

	const dateRange =
		timestamps.length >= 2
			? `${format(new Date(timestamps[0]), "dd MMM yyyy")} — ${format(
					new Date(timestamps[timestamps.length - 1]),
					"dd MMM yyyy",
				)}`
			: timestamps.length === 1
				? format(new Date(timestamps[0]), "dd MMM yyyy")
				: "NO DATE RANGE";

	const latestAutopsy = caseData.autopsyReports?.[0];
	const latestTod = caseData.todEstimates?.[0];
	const latestReconstruction = caseData.timelineReconstructions?.[0];

	return (
		<motion.div
			className="p-4 md:p-6 flex flex-col gap-6"
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			<TimelineReconstruction caseId={id} existing={latestReconstruction} />

			{/* Raw evidence rail — supporting reference for the reconstruction above */}
			<div>
				<div className="flex items-baseline gap-4 mb-3">
					<h2
						className="font-mono text-sm uppercase"
						style={{
							color: "var(--text-data)",
							letterSpacing: "0.12em",
						}}
					>
						RAW EVIDENCE TIMELINE
					</h2>
					<span
						className="font-mono text-xs"
						style={{ color: "var(--amber-dim)" }}
					>
						{dateRange}
					</span>
				</div>

				<TimelineRail
					digitalEvidence={digital}
					autopsyReport={latestAutopsy}
					todEstimate={latestTod}
					caseId={id}
				/>
			</div>
		</motion.div>
	);
}
