"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { AutopsyPanel } from "@/components/autopsy/AutopsyPanel";
import type { AutopsyReport } from "@/types";

export default function AutopsyPage() {
	const params = useParams<{ id: string }>();
	const id = params?.id ?? "";

	const [existingReport, setExistingReport] = useState<
		AutopsyReport | undefined
	>(undefined);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!id) return;
		const load = async () => {
			try {
				const res = await fetch(`/api/cases/${id}`);
				if (!res.ok) throw new Error("Failed to load case");
				const data = await res.json();
				setExistingReport(data.autopsyReports?.[0] ?? undefined);
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
		<motion.div
			className="p-4 md:p-6"
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.2, ease: "easeOut" }}
		>
			<AutopsyPanel caseId={id} existingReport={existingReport} />
		</motion.div>
	);
}
