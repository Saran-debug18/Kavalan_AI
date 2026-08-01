"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { MapContainer, TileLayer, CircleMarker, Popup } from "react-leaflet";
import type { RiskLevel } from "@/types";
import "leaflet/dist/leaflet.css";

export interface GeoCase {
	id: string;
	caseRef: string;
	title: string;
	status: string;
	riskLevel: RiskLevel;
	riskScore: number;
	location: string;
	lat: number;
	lng: number;
	victimName: string;
	dateOfIncident: string;
}

interface IntelMapProps {
	cases: GeoCase[];
}

function riskColor(risk: RiskLevel): string {
	switch (risk) {
		case "CRITICAL":
			return "#dc2626"; // red
		case "HIGH":
			return "#ea580c"; // orange
		case "MEDIUM":
			return "#d97706"; // amber
		default:
			return "#16a34a"; // green
	}
}

function FitToBounds({ cases }: { cases: GeoCase[] }) {
	useEffect(() => {
		// Map is created by MapContainer; we don't need to do anything extra here
		// because MapContainer has `bounds` configured in the parent.
	}, [cases]);
	return null;
}

export default function IntelMap({ cases }: IntelMapProps) {
	// Centre + zoom: average lat/lng, or fall back to world view if none.
	const { center, zoom, bounds } = useMemo(() => {
		if (cases.length === 0) {
			return {
				center: [20, 0] as [number, number],
				zoom: 2,
				bounds: undefined,
			};
		}
		if (cases.length === 1) {
			return {
				center: [cases[0].lat, cases[0].lng] as [number, number],
				zoom: 12,
				bounds: undefined,
			};
		}
		const lats = cases.map((c) => c.lat);
		const lngs = cases.map((c) => c.lng);
		const minLat = Math.min(...lats);
		const maxLat = Math.max(...lats);
		const minLng = Math.min(...lngs);
		const maxLng = Math.max(...lngs);
		return {
			center: [
				(minLat + maxLat) / 2,
				(minLng + maxLng) / 2,
			] as [number, number],
			zoom: 6,
			bounds: [
				[minLat, minLng],
				[maxLat, maxLng],
			] as [[number, number], [number, number]],
		};
	}, [cases]);

	return (
		<div style={{ height: "calc(100vh - 180px)", minHeight: 360 }}>
			<MapContainer
				center={center}
				zoom={zoom}
				bounds={bounds}
				boundsOptions={{ padding: [40, 40] }}
				style={{ height: "100%", width: "100%", background: "#0f1115" }}
				scrollWheelZoom
			>
				<TileLayer
					attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
					url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
				/>
				<FitToBounds cases={cases} />
				{cases.map((c) => (
					<CircleMarker
						key={c.id}
						center={[c.lat, c.lng]}
						radius={8 + Math.min(8, c.riskScore / 20)}
						pathOptions={{
							color: riskColor(c.riskLevel),
							fillColor: riskColor(c.riskLevel),
							fillOpacity: 0.55,
							weight: 2,
						}}
					>
						<Popup>
							<div
								style={{
									fontFamily:
										"'JetBrains Mono', ui-monospace, monospace",
									fontSize: 12,
									lineHeight: 1.4,
									minWidth: 220,
								}}
							>
								<div
									style={{
										fontSize: 10,
										letterSpacing: "0.08em",
										textTransform: "uppercase",
										color: "#666",
										marginBottom: 4,
									}}
								>
									{c.caseRef} · {c.status}
								</div>
								<div
									style={{
										fontWeight: 600,
										fontSize: 13,
										marginBottom: 6,
									}}
								>
									{c.title}
								</div>
								<div style={{ color: "#444", marginBottom: 6 }}>
									Victim: {c.victimName || "—"}
								</div>
								<div style={{ color: "#444", marginBottom: 6 }}>
									Location: {c.location}
								</div>
								<div style={{ marginBottom: 8 }}>
									Risk:{" "}
									<span
										style={{
											color: riskColor(c.riskLevel),
											fontWeight: 700,
										}}
									>
										{c.riskLevel}
									</span>{" "}
									<span style={{ color: "#777" }}>({c.riskScore}/100)</span>
								</div>
								<Link
									href={`/cases/${c.id}`}
									style={{
										display: "inline-block",
										padding: "4px 8px",
										background: "#111",
										color: "#fff",
										textDecoration: "none",
										fontSize: 10,
										letterSpacing: "0.08em",
										textTransform: "uppercase",
									}}
								>
									Open Case →
								</Link>
							</div>
						</Popup>
					</CircleMarker>
				))}
			</MapContainer>
		</div>
	);
}
