"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";
import type { CaseStatus } from "@/types";
import { StatusStamp } from "@/components/ui/StatusStamp";
import { useToast } from "@/components/ui/Toast";

interface CaseStatusControlProps {
	caseId: string;
	status: CaseStatus;
	onChanged?: (nextStatus: CaseStatus) => void;
}

const OPTIONS: { value: CaseStatus; label: string; hint: string }[] = [
	{ value: "OPEN", label: "OPEN", hint: "Newly filed, awaiting triage" },
	{ value: "ACTIVE", label: "ACTIVE", hint: "Investigation in progress" },
	{ value: "PENDING", label: "PENDING", hint: "Awaiting external input" },
	{ value: "CLOSED", label: "CLOSED", hint: "Case resolved" },
	{ value: "COLD", label: "COLD", hint: "Inactive, pending new leads" },
];

export function CaseStatusControl({
	caseId,
	status,
	onChanged,
}: CaseStatusControlProps) {
	const [current, setCurrent] = useState<CaseStatus>(status);
	const [open, setOpen] = useState(false);
	const [updating, setUpdating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const ref = useRef<HTMLDivElement>(null);
	const toast = useToast();

	useEffect(() => setCurrent(status), [status]);

	useEffect(() => {
		const onDocClick = (e: MouseEvent) => {
			if (!ref.current) return;
			if (!ref.current.contains(e.target as Node)) setOpen(false);
		};
		if (open) document.addEventListener("mousedown", onDocClick);
		return () => document.removeEventListener("mousedown", onDocClick);
	}, [open]);

	async function change(next: CaseStatus) {
		setOpen(false);
		if (next === current) return;
		setUpdating(true);
		setError(null);
		const prev = current;
		setCurrent(next); // optimistic
		try {
			const res = await fetch(`/api/cases/${caseId}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ status: next }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok)
				throw new Error(data.error ?? `HTTP ${res.status}`);
			onChanged?.(next);
			toast.success(`Case status changed to ${next}.`);
		} catch (err) {
			setCurrent(prev); // rollback
			const message = err instanceof Error ? err.message : "Update failed";
			setError(message);
			toast.error(`Status update failed: ${message}`);
		} finally {
			setUpdating(false);
		}
	}

	return (
		<div ref={ref} style={{ position: "relative" }}>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				disabled={updating}
				className="inline-flex items-center gap-1.5 disabled:opacity-50"
				style={{
					background: "transparent",
					border: "none",
					padding: 0,
					cursor: updating ? "wait" : "pointer",
				}}
				title="Change status"
			>
				<StatusStamp status={current} />
				<ChevronDown size={12} className="text-muted" strokeWidth={1.5} />
			</button>

			{open && (
				<div
					style={{
						position: "absolute",
						top: "calc(100% + 4px)",
						right: 0,
						minWidth: 220,
						background: "var(--bg-surface-2)",
						border: "1px solid var(--border)",
						boxShadow: "0 6px 20px rgba(0,0,0,0.45)",
						zIndex: 20,
					}}
				>
					<div
						className="font-mono text-[10px] uppercase tracking-widest text-muted"
						style={{
							padding: "8px 12px",
							borderBottom: "1px solid var(--border)",
						}}
					>
						Change Status
					</div>
					<ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
						{OPTIONS.map((o) => {
							const isCurrent = o.value === current;
							return (
								<li key={o.value}>
									<button
										type="button"
										onClick={() => change(o.value)}
										className="w-full text-left flex items-start gap-2 hover:bg-surface-3"
										style={{
											padding: "8px 12px",
											background: "transparent",
											border: "none",
											cursor: "pointer",
										}}
									>
										<span style={{ width: 14, marginTop: 2 }}>
											{isCurrent ? (
												<Check
													size={12}
													className="text-amber"
													strokeWidth={2}
												/>
											) : null}
										</span>
										<span style={{ flex: 1 }}>
											<span
												className="font-mono text-xs text-data block"
												style={{ letterSpacing: "0.05em" }}
											>
												{o.label}
											</span>
											<span className="font-mono text-[10px] text-muted block mt-0.5">
												{o.hint}
											</span>
										</span>
									</button>
								</li>
							);
						})}
					</ul>
				</div>
			)}

			{error && (
				<div
					className="font-mono text-[10px] text-crimson"
					style={{
						position: "absolute",
						top: "calc(100% + 4px)",
						right: 0,
						whiteSpace: "nowrap",
					}}
				>
					{error}
				</div>
			)}
		</div>
	);
}

export default CaseStatusControl;
