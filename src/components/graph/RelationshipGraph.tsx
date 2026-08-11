"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { User, Skull, MapPin, Cpu } from "lucide-react";
import type {
	CaseGraph,
	GraphNode,
	GraphEdge,
	GraphNodeType,
	Evidence,
	DigitalEvidence,
} from "@/types";

interface RelationshipGraphProps {
	graph: CaseGraph;
	evidence: Evidence[];
	digitalEvidence: DigitalEvidence[];
}

interface PositionedNode {
	node: GraphNode;
	x: number;
	y: number;
	radius: number;
}

interface TooltipState {
	node: GraphNode;
	x: number;
	y: number;
}

const BOARD_SIZE = 720;
const CENTER = BOARD_SIZE / 2;
const INNER_RING_R = 170;
const OUTER_RING_R = 300;
const MIN_NODE_R = 9;
const MAX_NODE_R = 28;
const VICTIM_R = 32;

const TYPE_COLORS: Record<GraphNodeType, string> = {
	VICTIM: "var(--crimson)",
	SUBJECT: "var(--amber)",
	LOCATION: "var(--sky)",
	DEVICE: "var(--sage)",
};

const TYPE_LABELS: Record<GraphNodeType, string> = {
	VICTIM: "Victim",
	SUBJECT: "Subject",
	LOCATION: "Location",
	DEVICE: "Device",
};

const TYPE_ICONS: Record<GraphNodeType, typeof User> = {
	VICTIM: Skull,
	SUBJECT: User,
	LOCATION: MapPin,
	DEVICE: Cpu,
};

const EDGE_COLOR: Record<GraphEdge["kind"], string> = {
	SAME_SUBJECT: "var(--amber)",
	CO_LOCATION: "var(--sky)",
	TIME_PROXIMITY: "var(--crimson)",
	CASE_LINK: "var(--border-strong)",
};

function circularMean(angles: number[]): number | null {
	if (angles.length === 0) return null;
	let sinSum = 0;
	let cosSum = 0;
	for (const a of angles) {
		sinSum += Math.sin(a);
		cosSum += Math.cos(a);
	}
	return Math.atan2(sinSum, cosSum);
}

function layoutNodes(graph: CaseGraph): PositionedNode[] {
	const { nodes, edges } = graph;
	const maxConnections = Math.max(1, ...nodes.map((n) => n.connectionCount));

	const neighborMap = new Map<string, string[]>();
	for (const e of edges) {
		if (!neighborMap.has(e.source)) neighborMap.set(e.source, []);
		if (!neighborMap.has(e.target)) neighborMap.set(e.target, []);
		neighborMap.get(e.source)!.push(e.target);
		neighborMap.get(e.target)!.push(e.source);
	}

	function radiusFor(node: GraphNode): number {
		if (node.type === "VICTIM") return VICTIM_R;
		const anomalyPart = (node.anomalyScore ?? 0) / 100;
		const connPart = node.connectionCount / maxConnections;
		const normalized = 0.6 * anomalyPart + 0.4 * connPart;
		return MIN_NODE_R + (MAX_NODE_R - MIN_NODE_R) * Math.min(1, normalized);
	}

	const positions = new Map<string, PositionedNode>();
	const angles = new Map<string, number>();

	const victim = nodes.find((n) => n.type === "VICTIM");
	if (victim) {
		positions.set(victim.id, { node: victim, x: CENTER, y: CENTER, radius: radiusFor(victim) });
	}

	const subjects = nodes
		.filter((n) => n.type === "SUBJECT")
		.sort((a, b) => b.connectionCount - a.connectionCount);
	subjects.forEach((node, i) => {
		const angle = -Math.PI / 2 + (i / Math.max(1, subjects.length)) * 2 * Math.PI;
		angles.set(node.id, angle);
		positions.set(node.id, {
			node,
			x: CENTER + INNER_RING_R * Math.cos(angle),
			y: CENTER + INNER_RING_R * Math.sin(angle),
			radius: radiusFor(node),
		});
	});

	const outer = nodes.filter((n) => n.type === "LOCATION" || n.type === "DEVICE");
	outer.forEach((node, i) => {
		const neighborAngles = (neighborMap.get(node.id) ?? [])
			.map((id) => angles.get(id))
			.filter((a): a is number => a !== undefined);
		const mean = circularMean(neighborAngles);
		const angle = mean ?? (-Math.PI / 2 + (i / Math.max(1, outer.length)) * 2 * Math.PI);
		positions.set(node.id, {
			node,
			x: CENTER + OUTER_RING_R * Math.cos(angle),
			y: CENTER + OUTER_RING_R * Math.sin(angle),
			radius: radiusFor(node),
		});
	});

	return Array.from(positions.values());
}

export function RelationshipGraph({
	graph,
	evidence,
	digitalEvidence,
}: RelationshipGraphProps) {
	const [tooltip, setTooltip] = useState<TooltipState | null>(null);

	const positioned = useMemo(() => layoutNodes(graph), [graph]);
	const posById = useMemo(() => {
		const m = new Map<string, PositionedNode>();
		for (const p of positioned) m.set(p.node.id, p);
		return m;
	}, [positioned]);

	const sourceLookup = useMemo(() => {
		const m = new Map<string, string>();
		for (const e of evidence) m.set(e.id, `[${e.catalogRef}] ${e.description}`);
		for (const d of digitalEvidence)
			m.set(d.id, `${d.sourceType} — ${d.subject}: ${d.description}`);
		return m;
	}, [evidence, digitalEvidence]);

	const presentTypes = Array.from(new Set(graph.nodes.map((n) => n.type)));

	if (graph.nodes.length <= 1) {
		return (
			<div className="flex items-center justify-center py-16">
				<span className="font-mono text-xs uppercase tracking-widest text-muted text-center max-w-sm">
					Not enough correlated evidence yet to build a relationship map
				</span>
			</div>
		);
	}

	return (
		<div className="flex flex-col gap-3">
			<div className="w-full flex justify-center overflow-x-auto">
				<svg
					viewBox={`0 0 ${BOARD_SIZE} ${BOARD_SIZE}`}
					className="w-full max-w-[720px] h-auto"
					style={{ minWidth: 320 }}
				>
					{/* Edges drawn first so nodes sit on top */}
					{graph.edges.map((edge, i) => {
						const a = posById.get(edge.source);
						const b = posById.get(edge.target);
						if (!a || !b) return null;
						const dashed = edge.kind === "CASE_LINK";
						return (
							<motion.line
								key={edge.id}
								x1={a.x}
								y1={a.y}
								x2={b.x}
								y2={b.y}
								stroke={EDGE_COLOR[edge.kind]}
								strokeWidth={dashed ? 1 : Math.min(4, 1 + edge.weight * 0.6)}
								strokeOpacity={dashed ? 0.35 : 0.6}
								strokeDasharray={dashed ? "4 4" : undefined}
								initial={{ pathLength: 0, opacity: 0 }}
								animate={{ pathLength: 1, opacity: dashed ? 0.35 : 0.6 }}
								transition={{ duration: 0.6, delay: 0.15 + i * 0.02, ease: "easeOut" }}
							/>
						);
					})}

					{/* Nodes */}
					{positioned.map(({ node, x, y, radius }, i) => {
						const Icon = TYPE_ICONS[node.type];
						return (
							<g key={node.id}>
								<motion.circle
									cx={x}
									cy={y}
									r={radius}
									fill={TYPE_COLORS[node.type]}
									fillOpacity={0.25}
									stroke={TYPE_COLORS[node.type]}
									strokeWidth={1.5}
									initial={{ opacity: 0, scale: 0 }}
									animate={{ opacity: 1, scale: 1 }}
									transition={{ duration: 0.25, ease: "easeOut", delay: i * 0.03 }}
									whileHover={{ scale: 1.15 }}
									style={{ cursor: "pointer", transformOrigin: `${x}px ${y}px` }}
									onMouseEnter={() => setTooltip({ node, x, y: y - radius - 8 })}
									onMouseLeave={() => setTooltip(null)}
								/>
								<Icon
									x={x - 6}
									y={y - 6}
									width={12}
									height={12}
									color={TYPE_COLORS[node.type]}
									strokeWidth={2}
									style={{ pointerEvents: "none" }}
								/>
								<text
									x={x}
									y={y + radius + 12}
									textAnchor="middle"
									style={{
										fontFamily: "'JetBrains Mono', monospace",
										fontSize: 9,
										fill: "var(--dim)",
										letterSpacing: "0.04em",
										pointerEvents: "none",
									}}
								>
									{node.label.length > 16 ? `${node.label.slice(0, 15)}…` : node.label}
								</text>
							</g>
						);
					})}

					{/* Tooltip */}
					{tooltip && (
						<g style={{ pointerEvents: "none" }}>
							{(() => {
								const refs = tooltip.node.sourceRefs
									.map((id) => sourceLookup.get(id))
									.filter((s): s is string => Boolean(s))
									.slice(0, 3);
								const lines = [
									`${TYPE_LABELS[tooltip.node.type].toUpperCase()} — ${tooltip.node.label}`,
									tooltip.node.anomalyScore !== undefined
										? `Anomaly: ${tooltip.node.anomalyScore} · Links: ${tooltip.node.connectionCount}`
										: `Links: ${tooltip.node.connectionCount}`,
									...refs.map((r) => (r.length > 46 ? `${r.slice(0, 45)}…` : r)),
								];
								const boxW = 260;
								const boxH = 16 + lines.length * 14;
								const boxX = Math.min(Math.max(tooltip.x - boxW / 2, 4), BOARD_SIZE - boxW - 4);
								const boxY = Math.max(tooltip.y - boxH, 4);
								return (
									<>
										<rect
											x={boxX}
											y={boxY}
											width={boxW}
											height={boxH}
											fill="var(--surface-2)"
											stroke="var(--border-strong)"
											strokeWidth={1}
											rx={2}
										/>
										{lines.map((line, i) => (
											<text
												key={i}
												x={boxX + 10}
												y={boxY + 18 + i * 14}
												style={{
													fontFamily: "'JetBrains Mono', monospace",
													fontSize: i === 0 ? 10 : 9,
													fill: i === 0 ? "var(--amber)" : "var(--data)",
													letterSpacing: "0.02em",
												}}
											>
												{line}
											</text>
										))}
									</>
								);
							})()}
						</g>
					)}
				</svg>
			</div>

			{/* Legend */}
			<div className="flex flex-wrap items-center justify-center gap-4 px-1">
				{presentTypes.map((type) => {
					const Icon = TYPE_ICONS[type];
					return (
						<div key={type} className="flex items-center gap-1.5">
							<Icon size={11} strokeWidth={2} color={TYPE_COLORS[type]} />
							<span className="font-mono text-[10px] uppercase tracking-widest text-muted">
								{TYPE_LABELS[type]}
							</span>
						</div>
					);
				})}
				<div className="flex items-center gap-1.5">
					<span
						className="inline-block"
						style={{ width: 14, height: 0, borderTop: "2px dashed var(--border-strong)" }}
					/>
					<span className="font-mono text-[10px] uppercase tracking-widest text-muted">
						Inferred link
					</span>
				</div>
			</div>
		</div>
	);
}

export default RelationshipGraph;
