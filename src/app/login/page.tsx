"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Shield } from "lucide-react";

function LoginForm() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [username, setUsername] = useState("");
	const [password, setPassword] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		setSubmitting(true);
		setError(null);
		try {
			const res = await fetch("/api/auth/login", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ username, password }),
			});
			const data = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(data.error ?? "Login failed");
			const next = searchParams.get("next") || "/";
			router.push(next);
			router.refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : "Login failed");
			setSubmitting(false);
		}
	}

	return (
		<div className="min-h-screen w-full flex items-center justify-center bg-base px-4">
			<div className="w-full max-w-sm">
				<div className="flex flex-col items-center gap-2 mb-8">
					<Shield size={28} className="text-amber" strokeWidth={1.5} aria-hidden="true" />
					<span className="font-mono text-lg uppercase tracking-widest text-amber">
						KAVALAN
					</span>
					<p className="font-mono text-xs text-dim tracking-wider uppercase">
						Forensic Intelligence — Analyst Login
					</p>
				</div>

				<form
					onSubmit={handleSubmit}
					className="flex flex-col gap-4 border border-border-DEFAULT bg-surface-1 p-6"
				>
					<div>
						<label className="block font-mono text-xs uppercase tracking-widest text-muted mb-1">
							Username
						</label>
						<input
							type="text"
							value={username}
							onChange={(e) => setUsername(e.target.value)}
							autoFocus
							autoComplete="username"
							required
							className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-sm px-3 py-2 outline-none focus:border-amber"
						/>
					</div>
					<div>
						<label className="block font-mono text-xs uppercase tracking-widest text-muted mb-1">
							Password
						</label>
						<input
							type="password"
							value={password}
							onChange={(e) => setPassword(e.target.value)}
							autoComplete="current-password"
							required
							className="w-full bg-surface-2 border border-border-DEFAULT text-data font-mono text-sm px-3 py-2 outline-none focus:border-amber"
						/>
					</div>

					{error && (
						<div className="font-mono text-xs text-crimson border border-crimson px-3 py-2">
							{error}
						</div>
					)}

					<button
						type="submit"
						disabled={submitting}
						className="mt-2 font-mono text-xs uppercase tracking-widest px-4 py-2.5 bg-amber border border-amber disabled:opacity-50 disabled:cursor-not-allowed"
						style={{ color: "var(--bg)" }}
					>
						{submitting ? "Authenticating..." : "Sign In"}
					</button>
				</form>

				<p className="mt-4 font-mono text-[10px] text-muted text-center leading-relaxed">
					Demo credentials: investigator / kavalan2026
				</p>
			</div>
		</div>
	);
}

export default function LoginPage() {
	return (
		<Suspense fallback={null}>
			<LoginForm />
		</Suspense>
	);
}
