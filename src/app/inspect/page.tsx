"use client";

import { useEffect, useMemo, useState } from "react";
import TopBar from "@/components/layout/TopBar";

interface TableSnapshot {
	name: string;
	count: number;
	latest: Record<string, unknown>[];
	columns: string[];
}

interface DebugPayload {
	dbFile: string;
	serverNow: string;
	nodeVersion: string;
	platform: string;
	tables: TableSnapshot[];
}

function truncate(v: unknown, len = 80): string {
	if (v === null || v === undefined) return "—";
	if (typeof v === "object") return JSON.stringify(v);
	const s = String(v);
	return s.length > len ? s.slice(0, len) + "…" : s;
}

export default function InspectPage() {
	const [data, setData] = useState<DebugPayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [autoRefresh, setAutoRefresh] = useState(true);
	const [selected, setSelected] = useState<string>("ai_calls");
	const [loading, setLoading] = useState(false);

	async function load() {
		setLoading(true);
		try {
			const res = await fetch("/api/debug/db", { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as DebugPayload;
			setData(json);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
		} finally {
			setLoading(false);
		}
	}

	useEffect(() => {
		load();
	}, []);

	useEffect(() => {
		if (!autoRefresh) return;
		const id = setInterval(load, 3000);
		return () => clearInterval(id);
	}, [autoRefresh]);

	const currentTable = useMemo(
		() => data?.tables.find((t) => t.name === selected) ?? null,
		[data, selected],
	);

	return (
		<>
			<TopBar
				title="DB INSPECTOR"
				subtitle="LIVE STORAGE · API · AI TELEMETRY"
			/>
			<div className="p-4 md:p-6">
				<div className="flex items-center gap-4 mb-4 flex-wrap">
					<button
						onClick={load}
						disabled={loading}
						className="font-mono text-xs uppercase tracking-widest px-3 py-1.5 border border-amber text-amber disabled:opacity-50"
						style={{ borderRadius: 0 }}
					>
						{loading ? "Refreshing..." : "Refresh Now"}
					</button>
					<label className="flex items-center gap-2 font-mono text-xs text-muted">
						<input
							type="checkbox"
							checked={autoRefresh}
							onChange={(e) => setAutoRefresh(e.target.checked)}
						/>
						Auto-refresh (3s)
					</label>
					{data && (
						<>
							<span className="font-mono text-[11px] text-muted">
								db: <span className="text-data">{data.dbFile}</span>
							</span>
							<span className="font-mono text-[11px] text-muted">
								node {data.nodeVersion} · {data.platform}
							</span>
							<span className="font-mono text-[11px] text-muted">
								server time: {data.serverNow}
							</span>
						</>
					)}
				</div>

				{error && (
					<div
						className="mb-4 p-3 font-mono text-xs"
						style={{
							background: "var(--bg-surface-2)",
							border: "1px solid var(--critical)",
							color: "var(--critical)",
						}}
					>
						ERROR: {error}
					</div>
				)}

				{data && (
					<>
						{/* Table chips */}
						<div className="flex flex-wrap gap-2 mb-4">
							{data.tables.map((t) => (
								<button
									key={t.name}
									type="button"
									onClick={() => setSelected(t.name)}
									className={`font-mono text-[11px] uppercase tracking-widest px-3 py-1.5 border ${
										selected === t.name
											? "border-amber text-amber"
											: "border-border-DEFAULT text-muted hover:text-data"
									}`}
									style={{ borderRadius: 0 }}
								>
									{t.name}{" "}
									<span className="text-muted">
										({t.count < 0 ? "err" : t.count})
									</span>
								</button>
							))}
						</div>

						{currentTable ? (
							<div className="border border-border-DEFAULT">
								<div className="px-4 py-2 border-b border-border-DEFAULT bg-surface-1 flex items-center gap-3">
									<span className="font-mono text-xs uppercase tracking-widest text-data">
										{currentTable.name}
									</span>
									<span className="font-mono text-[11px] text-muted">
										{currentTable.count} row
										{currentTable.count === 1 ? "" : "s"} · showing latest{" "}
										{currentTable.latest.length}
									</span>
								</div>
								<div className="overflow-x-auto">
									<table className="w-full border-collapse">
										<thead>
											<tr className="border-b border-border-DEFAULT">
												{currentTable.columns.map((c) => (
													<th
														key={c}
														className="px-3 py-2 text-left font-mono text-[10px] uppercase tracking-wider text-muted whitespace-nowrap"
													>
														{c}
													</th>
												))}
											</tr>
										</thead>
										<tbody>
											{currentTable.latest.length === 0 && (
												<tr>
													<td
														colSpan={currentTable.columns.length || 1}
														className="px-3 py-6 text-center font-mono text-xs text-muted uppercase tracking-widest"
													>
														No Rows
													</td>
												</tr>
											)}
											{currentTable.latest.map((row, i) => (
												<tr
													key={i}
													className="border-t border-border-DEFAULT hover:bg-surface-2 align-top"
												>
													{currentTable.columns.map((c) => {
														const v = (row as Record<string, unknown>)[c];
														return (
															<td
																key={c}
																className="px-3 py-2 font-mono text-[11px] text-data max-w-[320px]"
																title={
																	typeof v === "string"
																		? v
																		: v === null || v === undefined
																			? ""
																			: JSON.stringify(v)
																}
															>
																{truncate(v)}
															</td>
														);
													})}
												</tr>
											))}
										</tbody>
									</table>
								</div>
							</div>
						) : (
							<p className="font-mono text-xs text-muted">
								Table <span className="text-data">{selected}</span> not found
								(maybe it hasn&apos;t been created yet — run an analysis to
								populate <span className="text-data">ai_calls</span>).
							</p>
						)}
					</>
				)}
			</div>
		</>
	);
}
