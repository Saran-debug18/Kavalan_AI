"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";

interface SearchResult {
	type: "case" | "evidence" | "digital";
	caseId: string;
	caseRef: string;
	caseTitle: string;
	label: string;
	detail: string;
}

const TYPE_LABEL: Record<SearchResult["type"], string> = {
	case: "CASE",
	evidence: "EVIDENCE",
	digital: "DIGITAL",
};

export default function GlobalSearch() {
	const router = useRouter();
	const [query, setQuery] = useState("");
	const [results, setResults] = useState<SearchResult[]>([]);
	const [open, setOpen] = useState(false);
	const [loading, setLoading] = useState(false);
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const trimmed = query.trim();
		if (trimmed.length < 2) {
			setResults([]);
			setLoading(false);
			return;
		}
		setLoading(true);
		const id = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
				if (!res.ok) return;
				const data = await res.json();
				setResults(data.results ?? []);
			} finally {
				setLoading(false);
			}
		}, 250);
		return () => clearTimeout(id);
	}, [query]);

	useEffect(() => {
		function onClickOutside(e: MouseEvent) {
			if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
				setOpen(false);
			}
		}
		document.addEventListener("mousedown", onClickOutside);
		return () => document.removeEventListener("mousedown", onClickOutside);
	}, []);

	function handleSelect(r: SearchResult) {
		setOpen(false);
		setQuery("");
		setResults([]);
		router.push(`/cases/${r.caseId}`);
	}

	return (
		<div ref={containerRef} className="relative w-full">
			<div className="flex items-center gap-2 bg-surface-2 border border-border-DEFAULT px-2.5 h-8">
				<Search size={13} strokeWidth={1.5} className="text-dim shrink-0" aria-hidden="true" />
				<input
					type="text"
					value={query}
					onChange={(e) => {
						setQuery(e.target.value);
						setOpen(true);
					}}
					onFocus={() => setOpen(true)}
					placeholder="Search cases, evidence..."
					className="flex-1 min-w-0 bg-transparent outline-none font-mono text-xs text-data placeholder:text-muted"
					aria-label="Global search"
				/>
				{query && (
					<button
						type="button"
						onClick={() => {
							setQuery("");
							setResults([]);
						}}
						className="text-dim hover:text-data shrink-0"
						aria-label="Clear search"
					>
						<X size={13} strokeWidth={1.5} />
					</button>
				)}
			</div>

			{open && query.trim().length >= 2 && (
				<div className="absolute left-0 right-0 top-[calc(100%+4px)] z-50 max-h-[70vh] overflow-y-auto bg-surface-1 border border-border-DEFAULT shadow-lg">
					{loading && (
						<div className="px-3 py-3 font-mono text-xs text-muted uppercase tracking-widest">
							Searching...
						</div>
					)}
					{!loading && results.length === 0 && (
						<div className="px-3 py-3 font-mono text-xs text-muted uppercase tracking-widest">
							No matches
						</div>
					)}
					{!loading &&
						results.map((r, i) => (
							<button
								key={`${r.type}-${r.caseId}-${i}`}
								type="button"
								onClick={() => handleSelect(r)}
								className="w-full text-left px-3 py-2 border-t border-border-DEFAULT first:border-t-0 hover:bg-surface-2 active:bg-surface-2"
							>
								<div className="flex items-center gap-2 mb-0.5">
									<span className="font-mono text-[9px] uppercase tracking-widest text-amber-dim shrink-0">
										{TYPE_LABEL[r.type]}
									</span>
									<span className="font-mono text-[10px] text-dim truncate">
										{r.caseRef}
									</span>
								</div>
								<div className="text-sm text-data truncate">{r.label}</div>
								{r.detail && (
									<div className="text-xs text-muted truncate">{r.detail}</div>
								)}
							</button>
						))}
				</div>
			)}
		</div>
	);
}
