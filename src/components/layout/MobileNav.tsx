"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./Sidebar";
import UserMenu from "./UserMenu";

export default function MobileNav() {
	const pathname = usePathname();

	return (
		<nav
			className="flex md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border-DEFAULT bg-surface-1"
			style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
			aria-label="Primary navigation"
		>
			{NAV_ITEMS.map(({ label, href, icon: Icon }) => {
				const isActive =
					href === "/" ? pathname === "/" : pathname.startsWith(href);

				return (
					<Link
						key={href}
						href={href}
						className={cn(
							"flex flex-1 flex-col items-center justify-center gap-1 py-2.5 min-h-[56px] font-mono text-[9px] uppercase tracking-wider transition-colors",
							isActive ? "text-amber" : "text-muted",
						)}
						aria-current={isActive ? "page" : undefined}
					>
						<Icon size={18} strokeWidth={1.5} aria-hidden="true" />
						{label}
					</Link>
				);
			})}
			<UserMenu variant="mobile" />
		</nav>
	);
}
