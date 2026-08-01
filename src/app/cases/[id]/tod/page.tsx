"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { TodPanel } from "@/components/tod/TodPanel";
import type { TodEstimate } from "@/types";

export default function TodPage() {
	const params = useParams<{ id: string }>();
	const id = params?.id ?? "";

	const [existingEstimate, setExistingEstimate] = useState<
		TodEstimate | undefined
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
				setExistingEstimate(data.todEstimates?.[0] ?? undefined);
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
			<TodPanel caseId={id} existingEstimate={existingEstimate} />
		</motion.div>
	);
}
