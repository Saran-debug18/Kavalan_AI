"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import GlobalSearch from "./GlobalSearch";
import ThemeToggle from "./ThemeToggle";

interface TopBarProps {
	title: string;
	subtitle?: string;
	actions?: ReactNode;
}

function pad(n: number) {
	return String(n).padStart(2, "0");
}

function formatClock(date: Date): string {
	return `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function TopBar({ title, subtitle, actions }: TopBarProps) {
	const [time, setTime] = useState<string>("");

	useEffect(() => {
		setTime(formatClock(new Date()));
		const id = setInterval(() => setTime(formatClock(new Date())), 1000);
		return () => clearInterval(id);
	}, []);

	return (
		<header className="flex flex-col border-b border-border-DEFAULT bg-surface-1">
			<div className="flex h-14 items-center justify-between px-4 md:px-6 gap-3">
				<div className="flex flex-col justify-center gap-0.5 min-w-0">
					<h1 className="font-mono text-xs md:text-sm uppercase tracking-wider text-data leading-none truncate">
						{title}
					</h1>
					{subtitle && (
						<p className="font-mono text-[10px] md:text-xs text-dim leading-none truncate">
							{subtitle}
						</p>
					)}
				</div>

				<div className="hidden md:block w-full max-w-[320px]">
					<GlobalSearch />
				</div>

				<div className="flex items-center gap-3 md:gap-4 shrink-0">
					{actions}
					<ThemeToggle />
					<span
						className="hidden sm:inline font-mono text-xs text-dim tabular-nums"
						aria-label="Current time"
					>
						{time}
					</span>
				</div>
			</div>
			<div className="px-4 pb-3 md:hidden">
				<GlobalSearch />
			</div>
		</header>
	);
}
