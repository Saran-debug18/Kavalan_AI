"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Shield, LayoutDashboard, FolderOpen, Plus, Database, Map } from "lucide-react";
import { cn } from "@/lib/utils";
import UserMenu from "./UserMenu";

export const NAV_ITEMS = [
	{ label: "Dashboard", href: "/", icon: LayoutDashboard },
	{ label: "Cases", href: "/cases", icon: FolderOpen },
	{ label: "New Case", href: "/cases/new", icon: Plus },
	{ label: "Intel Map", href: "/map", icon: Map },
	{ label: "Inspector", href: "/inspect", icon: Database },
] as const;

export default function Sidebar() {
	const pathname = usePathname();

	return (
		<nav
			className="hidden md:flex h-full w-[240px] flex-col bg-surface-1 border-r border-border-DEFAULT"
			aria-label="Primary navigation"
		>
			{/* Wordmark */}
			<div className="px-5 pt-6 pb-5 border-b border-border-DEFAULT">
				<div className="flex items-center gap-2.5">
					<Shield
						size={16}
						className="text-amber shrink-0"
						strokeWidth={1.5}
						aria-hidden="true"
					/>
					<span className="font-mono text-sm uppercase tracking-widest text-amber">
						KAVALAN
					</span>
				</div>
				<p className="mt-1.5 font-mono text-xs text-dim tracking-wider">
					FORENSIC INTELLIGENCE v1.0
				</p>
			</div>

			{/* Navigation */}
			<ul className="flex-1 py-3 space-y-0.5 list-none m-0 p-3" role="list">
				{NAV_ITEMS.map(({ label, href, icon: Icon }) => {
					const isActive =
						href === "/" ? pathname === "/" : pathname.startsWith(href);

					return (
						<li key={href}>
							<Link
								href={href}
								className={cn(
									"relative flex items-center gap-3 px-3 py-2.5 font-mono text-xs uppercase tracking-wider transition-colors",
									isActive
										? "bg-amber-bg text-amber"
										: "text-muted hover:text-data hover:bg-surface-2",
								)}
							>
								{/* Active indicator: 2px right border */}
								{isActive && (
									<span
										className="absolute right-0 top-0 h-full w-0.5 bg-amber"
										aria-hidden="true"
									/>
								)}
								<Icon size={14} strokeWidth={1.5} aria-hidden="true" />
								{label}
							</Link>
						</li>
					);
				})}
			</ul>

			{/* Bottom: analyst identity + logout */}
			<UserMenu variant="sidebar" />
		</nav>
	);
}
