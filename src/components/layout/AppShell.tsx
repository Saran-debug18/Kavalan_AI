"use client";

import type { ReactNode } from "react";
import MobileNav from "./MobileNav";

interface AppShellProps {
	children: ReactNode;
	sidebar: ReactNode;
}

export default function AppShell({ children, sidebar }: AppShellProps) {
	return (
		<div className="flex h-screen w-full overflow-hidden bg-base">
			<aside className="hidden md:block h-full w-[240px] shrink-0">
				{sidebar}
			</aside>
			<main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
			<MobileNav />
		</div>
	);
}
