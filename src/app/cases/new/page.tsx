"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import TopBar from "@/components/layout/TopBar";
import { Button } from "@/components/ui/Button";
import type { RiskLevel } from "@/types";

const inputStyle: React.CSSProperties = {
	background: "var(--bg-surface-2)",
	border: "1px solid var(--border)",
	color: "var(--text-data)",
	fontFamily: "var(--font-mono, monospace)",
	fontSize: "13px",
	padding: "8px",
	borderRadius: "3px",
	outline: "none",
	width: "100%",
};

const labelStyle: React.CSSProperties = {
	display: "block",
	fontFamily: "var(--font-mono, monospace)",
	fontSize: "11px",
	color: "var(--text-dim)",
	textTransform: "uppercase",
	letterSpacing: "0.08em",
	marginBottom: "8px",
};

export default function NewCasePage() {
	const router = useRouter();
	const [submitting, setSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const [form, setForm] = useState({
		title: "",
		victimName: "",
		location: "",
		dateOfIncident: "",
		assignedAgent: "Det. Unassigned",
		description: "",
		tags: "",
		riskLevel: "LOW" as RiskLevel,
	});

	const handleChange = (
		e: React.ChangeEvent<
			HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
		>,
	) => {
		setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
	};

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/cases", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					...form,
					tags: form.tags
						? JSON.stringify(
								form.tags
									.split(",")
									.map((t) => t.trim())
									.filter(Boolean),
							)
						: "[]",
				}),
			});
			if (!res.ok) {
				const body = await res.json().catch(() => ({}));
				throw new Error(body.error ?? "Failed to create case");
			}
			const newCase = await res.json();
			router.push(`/cases/${newCase.id}`);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			setSubmitting(false);
		}
	};

	const fieldGroup = (
		label: string,
		name: string,
		type = "text",
		required = false,
	) => (
		<div>
			<label style={labelStyle}>
				{label}
				{required && (
					<span style={{ color: "var(--critical)", marginLeft: 2 }}>*</span>
				)}
			</label>
			<input
				type={type}
				name={name}
				value={form[name as keyof typeof form] as string}
				onChange={handleChange}
				required={required}
				style={inputStyle}
				onFocus={(e) => (e.currentTarget.style.borderColor = "var(--amber)")}
				onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
			/>
		</div>
	);

	return (
		<>
			<TopBar title="NEW INVESTIGATION" subtitle="OPEN CASE FILE" />

			<motion.div
				className="p-4 md:p-6"
				initial={{ opacity: 0, y: 8 }}
				animate={{ opacity: 1, y: 0 }}
				transition={{ duration: 0.2, ease: "easeOut" }}
			>
				<div style={{ maxWidth: "672px" }}>
					{error && (
						<div
							className="mb-4 p-3 rounded font-mono text-xs"
							style={{
								background: "var(--critical-bg)",
								border: "1px solid var(--critical)",
								color: "var(--critical)",
							}}
						>
							ERROR: {error}
						</div>
					)}

					<form onSubmit={handleSubmit} className="flex flex-col gap-5">
						{fieldGroup("Case Title", "title", "text", true)}
						{fieldGroup("Victim Name", "victimName")}
						{fieldGroup("Location", "location")}
						{fieldGroup("Date of Incident", "dateOfIncident", "date")}
						{fieldGroup("Assigned Agent", "assignedAgent")}

						<div>
							<label style={labelStyle}>Description</label>
							<textarea
								name="description"
								value={form.description}
								onChange={handleChange}
								rows={4}
								style={{ ...inputStyle, resize: "vertical" }}
								onFocus={(e) =>
									(e.currentTarget.style.borderColor = "var(--amber)")
								}
								onBlur={(e) =>
									(e.currentTarget.style.borderColor = "var(--border)")
								}
							/>
						</div>

						<div>
							<label style={labelStyle}>Tags</label>
							<input
								type="text"
								name="tags"
								value={form.tags}
								onChange={handleChange}
								placeholder="homicide, organized-crime, financial-fraud"
								style={{ ...inputStyle }}
								onFocus={(e) =>
									(e.currentTarget.style.borderColor = "var(--amber)")
								}
								onBlur={(e) =>
									(e.currentTarget.style.borderColor = "var(--border)")
								}
							/>
							<p
								className="mt-1 font-mono text-xs"
								style={{ color: "var(--text-muted)" }}
							>
								Separate with commas
							</p>
						</div>

						<div>
							<label style={labelStyle}>Initial Risk Assessment</label>
							<select
								name="riskLevel"
								value={form.riskLevel}
								onChange={handleChange}
								style={inputStyle}
								onFocus={(e) =>
									(e.currentTarget.style.borderColor = "var(--amber)")
								}
								onBlur={(e) =>
									(e.currentTarget.style.borderColor = "var(--border)")
								}
							>
								<option value="LOW">LOW</option>
								<option value="MEDIUM">MEDIUM</option>
								<option value="HIGH">HIGH</option>
								<option value="CRITICAL">CRITICAL</option>
							</select>
						</div>

						<div className="mt-6">
							<Button
								type="submit"
								variant="primary"
								disabled={submitting}
							>
								{submitting ? "OPENING FILE..." : "OPEN INVESTIGATION FILE"}
							</Button>
						</div>
					</form>
				</div>
			</motion.div>
		</>
	);
}
