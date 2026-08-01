"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import AppShell from "./AppShell";
import Sidebar from "./Sidebar";

const SHELL_LESS_PREFIXES = ["/login"];

export default function ConditionalShell({ children }: { children: ReactNode }) {
	const pathname = usePathname();
	const noShell = SHELL_LESS_PREFIXES.some((p) => pathname?.startsWith(p));

	if (noShell) return <>{children}</>;

	return <AppShell sidebar={<Sidebar />}>{children}</AppShell>;
}
