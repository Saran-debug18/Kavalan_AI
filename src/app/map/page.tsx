"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import TopBar from "@/components/layout/TopBar";
import type { GeoCase } from "@/components/map/IntelMap";

// Leaflet needs window; render it client-only.
const IntelMap = dynamic(() => import("@/components/map/IntelMap"), {
	ssr: false,
	loading: () => (
		<div className="flex items-center justify-center h-64 font-mono text-xs text-muted uppercase tracking-widest">
			Loading map...
		</div>
	),
});

interface GeocodePayload {
	cases: GeoCase[];
	missing: number;
}

export default function MapPage() {
	const [data, setData] = useState<GeocodePayload | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [geocoding, setGeocoding] = useState(false);
	const [geocodeStatus, setGeocodeStatus] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const autoStartedRef = useRef(false);

	async function load() {
		try {
			const res = await fetch("/api/geocode", { cache: "no-store" });
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const json = (await res.json()) as GeocodePayload;
			setData(json);
			setError(null);
			return json;
		} catch (err) {
			setError(err instanceof Error ? err.message : "Unknown error");
			return null;
		} finally {
			setLoading(false);
		}
	}

	async function runGeocode(force = false) {
		setGeocoding(true);
		setGeocodeStatus(null);

		// Poll in parallel so pins appear progressively as Nominatim resolves them.
		let polling = true;
		const poll = async () => {
			while (polling) {
				await new Promise((r) => setTimeout(r, 1500));
				if (!polling) break;
				await load();
			}
		};
		const poller = poll();

		try {
			const res = await fetch("/api/geocode", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ force }),
			});
			const json = await res.json();
			if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
			const ok = (json.results ?? []).filter(
				(r: { status: string }) => r.status === "ok",
			).length;
			const miss = (json.results ?? []).filter(
				(r: { status: string }) => r.status === "not_found",
			).length;
			const err = (json.results ?? []).filter(
				(r: { status: string }) => r.status === "error",
			).length;
			setGeocodeStatus(
				`Scanned ${json.scanned}, attempted ${json.attempted}, resolved ${ok}, unresolved ${miss}, errored ${err}.`,
			);
		} catch (e) {
			setGeocodeStatus(
				`Error: ${e instanceof Error ? e.message : "unknown"}`,
			);
		} finally {
			polling = false;
			await poller;
			await load();
			setGeocoding(false);
		}
	}

	useEffect(() => {
		(async () => {
			const json = await load();
			// If there are unplotted cases, auto-resolve them once per mount.
			if (json && json.missing > 0 && !autoStartedRef.current) {
				autoStartedRef.current = true;
				await runGeocode(false);
			}
		})();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return (
		<>
			<TopBar title="INTEL MAP" subtitle="GEOSPATIAL CASE OVERVIEW" />
			<div className="p-4 md:p-6">
				<div className="flex items-center flex-wrap gap-3 mb-4">
					<button
						type="button"
						onClick={() => runGeocode(false)}
						disabled={geocoding}
						className="font-mono text-xs uppercase tracking-widest px-3 py-1.5 border border-amber text-amber disabled:opacity-50"
						style={{ borderRadius: 0 }}
					>
						{geocoding ? "Geocoding..." : "Geocode Missing"}
					</button>
					<button
						type="button"
						onClick={() => runGeocode(true)}
						disabled={geocoding}
						className="font-mono text-[10px] uppercase tracking-widest px-3 py-1.5 border border-border-DEFAULT text-muted hover:text-data disabled:opacity-50"
						style={{ borderRadius: 0 }}
					>
						Re-geocode All
					</button>
					{data && (
						<span className="font-mono text-[11px] text-muted">
							<span className="text-data">{data.cases.length}</span> case
							{data.cases.length === 1 ? "" : "s"} on map ·{" "}
							<span className="text-data">{data.missing}</span> unplotted (need
							geocoding)
						</span>
					)}
					{geocodeStatus && (
						<span className="font-mono text-[11px] text-sage">
							{geocodeStatus}
						</span>
					)}
				</div>

				{/* Legend */}
				<div className="flex items-center gap-4 mb-4 font-mono text-[10px] uppercase tracking-widest text-muted">
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block w-2.5 h-2.5 rounded-full"
							style={{ background: "#dc2626" }}
						/>
						Critical
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block w-2.5 h-2.5 rounded-full"
							style={{ background: "#ea580c" }}
						/>
						High
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block w-2.5 h-2.5 rounded-full"
							style={{ background: "#d97706" }}
						/>
						Medium
					</span>
					<span className="flex items-center gap-1.5">
						<span
							className="inline-block w-2.5 h-2.5 rounded-full"
							style={{ background: "#16a34a" }}
						/>
						Low
					</span>
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

				{loading ? (
					<p className="font-mono text-xs text-muted uppercase tracking-widest">
						Loading cases...
					</p>
				) : data && data.cases.length === 0 ? (
					<div
						className="p-6 font-mono text-xs text-muted"
						style={{
							border: "1px dashed var(--border)",
							background: "var(--bg-surface-1)",
						}}
					>
						<p className="mb-2 uppercase tracking-widest text-data">
							{geocoding ? "Resolving Locations..." : "No Cases On Map Yet"}
						</p>
						<p className="leading-relaxed">
							{geocoding
								? "Calling OpenStreetMap Nominatim (1 req/sec). Pins will appear here progressively as each case resolves."
								: "Every case has a textual location but latitude/longitude are only added after geocoding. They should auto-resolve on page load; if not, click Geocode Missing above."}
						</p>
					</div>
				) : data ? (
					<IntelMap cases={data.cases} />
				) : null}
			</div>
		</>
	);
}
