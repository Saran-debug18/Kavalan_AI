"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { DigitalPanel } from "@/components/digital/DigitalPanel";
import type { DigitalEvidence } from "@/types";

export default function DigitalPage() {
	const params = useParams<{ id: string }>();
	const id = params?.id ?? "";

	const [digitalEvidence, setDigitalEvidence] = useState<DigitalEvidence[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	const load = async () => {
		if (!id) return;
		try {
			const res = await fetch(`/api/cases/${id}`);
			if (!res.ok) throw new Error("Failed to load case");
			const data = await res.json();
			setDigitalEvidence(data.digitalEvidence ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	};

	useEffect(() => {
		load();
		// eslint-disable-next-line react-hooks/exhaustive-deps
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
			<DigitalPanel caseId={id} digitalEvidence={digitalEvidence} onRefresh={load} />
		</motion.div>
	);
}
