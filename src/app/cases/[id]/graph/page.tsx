"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { RelationshipGraph } from "@/components/graph/RelationshipGraph";
import { buildCaseGraph } from "@/lib/graph";
import type { Case, Evidence, DigitalEvidence } from "@/types";

interface CaseDetail extends Case {
	evidence?: Evidence[];
	digitalEvidence?: DigitalEvidence[];
}

export default function RelationshipGraphPage() {
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

	const evidence = caseData?.evidence ?? [];
	const digitalEvidence = caseData?.digitalEvidence ?? [];

	const graph = useMemo(
		() =>
			buildCaseGraph({
				victimName: caseData?.victimName ?? "",
				evidence,
				digitalEvidence,
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[caseData],
	);

	if (loading) {
		return (
			<div className="flex items-center justify-center h-64">
				<span className="font-mono text-sm" style={{ color: "var(--text-dim)" }}>
					LOADING...
				</span>
			</div>
		);
	}

	if (error || !caseData) {
		return (
			<div className="flex items-center justify-center h-64">
				<span className="font-mono text-sm" style={{ color: "var(--critical)" }}>
					{error ?? "CASE NOT FOUND"}
				</span>
			</div>
		);
	}

	return (
		<motion.div
			className="p-4 md:p-6 flex flex-col gap-4"
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			<div className="flex items-baseline gap-4 flex-wrap">
				<h2
					className="font-mono text-sm uppercase"
					style={{ color: "var(--text-data)", letterSpacing: "0.12em" }}
				>
					RELATIONSHIP MAP
				</h2>
				<span className="font-mono text-xs" style={{ color: "var(--amber-dim)" }}>
					{graph.nodes.length} node{graph.nodes.length === 1 ? "" : "s"} ·{" "}
					{graph.edges.length} link{graph.edges.length === 1 ? "" : "s"}
				</span>
			</div>
			<p className="font-mono text-[11px] text-muted max-w-2xl">
				Subjects, locations, and devices connected by relationships inferred from
				shared subjects, shared locations, and close-in-time activity across
				digital evidence records.
			</p>

			<div className="border border-border-DEFAULT bg-surface-1 p-4">
				<RelationshipGraph
					graph={graph}
					evidence={evidence}
					digitalEvidence={digitalEvidence}
				/>
			</div>
		</motion.div>
	);
}
