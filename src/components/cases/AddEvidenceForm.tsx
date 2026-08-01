"use client";

import { useEffect, useRef, useState } from "react";
import type { EvidenceType } from "@/types";
import { useToast } from "@/components/ui/Toast";

interface AddEvidenceFormProps {
	caseId: string;
	onCreated?: () => void;
}

const TYPES: EvidenceType[] = [
	"PHYSICAL",
	"BIOLOGICAL",
	"FORENSIC",
	"DIGITAL",
	"TESTIMONIAL",
];

const inputStyle: React.CSSProperties = {
	background: "var(--bg-surface-2)",
	border: "1px solid var(--border)",
	color: "var(--text-data)",
	fontFamily: "var(--font-mono, monospace)",
	fontSize: "12px",
	padding: "6px 8px",
	borderRadius: 0,
	outline: "none",
	width: "100%",
};

const labelStyle: React.CSSProperties = {
	display: "block",
	fontFamily: "var(--font-mono, monospace)",
	fontSize: "10px",
	textTransform: "uppercase",
	letterSpacing: "0.08em",
	color: "var(--text-muted)",
	marginBottom: "4px",
};

export function AddEvidenceForm({ caseId, onCreated }: AddEvidenceFormProps) {
	const toast = useToast();
	const [open, setOpen] = useState(false);
	const [submitting, setSubmitting] = useState(false);
	const [status, setStatus] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);

	const [form, setForm] = useState({
		type: "PHYSICAL" as EvidenceType,
		description: "",
		location: "",
		analyst: "Investigator",
		notes: "",
		confidence: "0.85",
		collectedAt: "",
	});
	const [image, setImage] = useState<File | null>(null);
	const [imagePreview, setImagePreview] = useState<string | null>(null);
	const fileRef = useRef<HTMLInputElement>(null);
	const [sessionName, setSessionName] = useState("Investigator");

	useEffect(() => {
		fetch("/api/auth/me")
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.name) {
					setSessionName(data.name);
					setForm((f) => ({ ...f, analyst: data.name }));
				}
			})
			.catch(() => {});
	}, []);

	function resetForm() {
		setForm({
			type: "PHYSICAL",
			description: "",
			location: "",
			analyst: sessionName,
			notes: "",
			confidence: "0.85",
			collectedAt: "",
		});
		setImage(null);
		setImagePreview(null);
		if (fileRef.current) fileRef.current.value = "";
	}

	function onChoose(e: React.ChangeEvent<HTMLInputElement>) {
		const f = e.target.files?.[0] ?? null;
		if (!f) {
			setImage(null);
			setImagePreview(null);
			return;
		}
		setImage(f);
		const reader = new FileReader();
		reader.onload = () => setImagePreview(reader.result as string);
		reader.readAsDataURL(f);
	}

	async function submit() {
		if (!form.description.trim()) {
			setError("Description is required.");
			return;
		}
		setSubmitting(true);
		setError(null);
		setStatus(null);
		try {
			const fd = new FormData();
			fd.append("type", form.type);
			fd.append("description", form.description);
			fd.append("location", form.location);
			fd.append("analyst", form.analyst);
			fd.append("notes", form.notes);
			fd.append("confidence", form.confidence);
			if (form.collectedAt) {
				const iso = new Date(form.collectedAt).toISOString();
				fd.append("collectedAt", iso);
			}
			if (image) fd.append("image", image);

			const res = await fetch(`/api/cases/${caseId}/evidence`, {
				method: "POST",
				body: fd,
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
			setStatus(`Added ${data.catalogRef}.`);
			toast.success(`Evidence ${data.catalogRef} added to the case.`);
			resetForm();
			onCreated?.();
		} catch (err) {
			const message = err instanceof Error ? err.message : "Unknown error";
			setError(message);
			toast.error(`Failed to add evidence: ${message}`);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div style={{ marginBottom: 12 }}>
			<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
				<button
					type="button"
					onClick={() => {
						setOpen((v) => !v);
						setError(null);
						setStatus(null);
					}}
					className="font-mono text-[10px] uppercase tracking-widest"
					style={{
						padding: "4px 10px",
						background: open ? "transparent" : "var(--amber)",
						color: open ? "var(--amber)" : "var(--bg)",
						border: `1px solid var(--amber)`,
						cursor: "pointer",
						borderRadius: 0,
					}}
				>
					{open ? "Cancel" : "+ Add Evidence"}
				</button>
				{status && (
					<span
						className="font-mono text-[11px]"
						style={{ color: "var(--sage)" }}
					>
						{status}
					</span>
				)}
			</div>

			{open && (
				<div
					className="grid grid-cols-1 sm:grid-cols-3"
					style={{
						marginTop: 10,
						padding: 12,
						border: "1px solid var(--border)",
						background: "var(--bg-surface-1)",
						display: "grid",
						gap: 10,
					}}
				>
					<div>
						<label style={labelStyle}>Type *</label>
						<select
							value={form.type}
							onChange={(e) =>
								setForm({ ...form, type: e.target.value as EvidenceType })
							}
							style={inputStyle}
						>
							{TYPES.map((t) => (
								<option key={t} value={t}>
									{t}
								</option>
							))}
						</select>
					</div>
					<div>
						<label style={labelStyle}>Analyst</label>
						<input
							type="text"
							value={form.analyst}
							onChange={(e) => setForm({ ...form, analyst: e.target.value })}
							style={inputStyle}
						/>
					</div>
					<div>
						<label style={labelStyle}>Confidence (0-1)</label>
						<input
							type="number"
							step="0.05"
							min="0"
							max="1"
							value={form.confidence}
							onChange={(e) =>
								setForm({ ...form, confidence: e.target.value })
							}
							style={inputStyle}
						/>
					</div>
					<div style={{ gridColumn: "span 3" }}>
						<label style={labelStyle}>Description *</label>
						<textarea
							rows={2}
							value={form.description}
							onChange={(e) =>
								setForm({ ...form, description: e.target.value })
							}
							placeholder="e.g. Blood spatter pattern on north wall; low-velocity impact."
							style={{ ...inputStyle, resize: "vertical" }}
						/>
					</div>
					<div>
						<label style={labelStyle}>Location</label>
						<input
							type="text"
							value={form.location}
							onChange={(e) => setForm({ ...form, location: e.target.value })}
							placeholder="Scene / lab reference"
							style={inputStyle}
						/>
					</div>
					<div>
						<label style={labelStyle}>Collected At</label>
						<input
							type="datetime-local"
							value={form.collectedAt}
							onChange={(e) =>
								setForm({ ...form, collectedAt: e.target.value })
							}
							style={inputStyle}
						/>
					</div>
					<div>
						<label style={labelStyle}>Image (optional)</label>
						<label
							className="font-mono text-[10px] uppercase tracking-widest"
							style={{
								padding: "6px 10px",
								border: "1px solid var(--border)",
								color: "var(--text-muted)",
								cursor: "pointer",
								display: "inline-block",
								background: "var(--bg-surface-2)",
							}}
						>
							{image ? "Change..." : "Choose File"}
							<input
								ref={fileRef}
								type="file"
								accept="image/png,image/jpeg,image/webp,image/gif"
								onChange={onChoose}
								style={{ display: "none" }}
							/>
						</label>
					</div>
					<div style={{ gridColumn: "span 3" }}>
						<label style={labelStyle}>Notes</label>
						<textarea
							rows={2}
							value={form.notes}
							onChange={(e) => setForm({ ...form, notes: e.target.value })}
							placeholder="Collection notes, chain of custody, analyst comments..."
							style={{ ...inputStyle, resize: "vertical" }}
						/>
					</div>

					{imagePreview && (
						<div style={{ gridColumn: "span 3" }}>
							<label style={labelStyle}>Preview</label>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={imagePreview}
								alt="Evidence preview"
								style={{
									maxHeight: 160,
									maxWidth: "100%",
									border: "1px solid var(--border)",
								}}
							/>
						</div>
					)}

					{error && (
						<div
							style={{ gridColumn: "span 3", color: "var(--critical)" }}
							className="font-mono text-xs"
						>
							ERROR: {error}
						</div>
					)}

					<div style={{ gridColumn: "span 3", display: "flex", gap: 8 }}>
						<button
							type="button"
							onClick={submit}
							disabled={submitting}
							className="font-mono text-xs uppercase tracking-widest"
							style={{
								padding: "6px 14px",
								background: "var(--amber)",
								color: "var(--bg)",
								border: "1px solid var(--amber)",
								borderRadius: 0,
								cursor: submitting ? "wait" : "pointer",
								opacity: submitting ? 0.5 : 1,
							}}
						>
							{submitting ? "Saving..." : "Save Evidence"}
						</button>
						<button
							type="button"
							onClick={() => {
								resetForm();
								setError(null);
								setStatus(null);
							}}
							disabled={submitting}
							className="font-mono text-[10px] uppercase tracking-widest"
							style={{
								padding: "6px 10px",
								background: "transparent",
								color: "var(--text-muted)",
								border: "1px solid var(--border)",
								borderRadius: 0,
								cursor: "pointer",
							}}
						>
							Clear
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

export default AddEvidenceForm;
