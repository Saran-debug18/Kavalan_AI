"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

interface UserMenuProps {
	variant?: "sidebar" | "mobile";
}

export default function UserMenu({ variant = "sidebar" }: UserMenuProps) {
	const router = useRouter();
	const [name, setName] = useState<string | null>(null);

	useEffect(() => {
		fetch("/api/auth/me")
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => setName(data?.name ?? null))
			.catch(() => setName(null));
	}, []);

	async function handleLogout() {
		await fetch("/api/auth/logout", { method: "POST" });
		router.push("/login");
		router.refresh();
	}

	if (variant === "mobile") {
		return (
			<button
				type="button"
				onClick={handleLogout}
				className="flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] font-mono text-[9px] uppercase tracking-wider text-muted"
			>
				<LogOut size={18} strokeWidth={1.5} aria-hidden="true" />
				Logout
			</button>
		);
	}

	return (
		<div className="px-5 py-4 border-t border-border-DEFAULT flex items-center justify-between gap-2">
			<div className="min-w-0">
				<p className="font-mono text-xs uppercase tracking-wider text-data truncate">
					{name ?? "Analyst"}
				</p>
				<p className="font-mono text-[10px] uppercase tracking-wider text-dim">
					Analyst Console
				</p>
			</div>
			<button
				type="button"
				onClick={handleLogout}
				title="Log out"
				className={cn(
					"shrink-0 text-dim hover:text-crimson transition-colors p-1.5",
				)}
			>
				<LogOut size={15} strokeWidth={1.5} />
			</button>
		</div>
	);
}
