"use client";

import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";

const STORAGE_KEY = "kavalan-theme";

export default function ThemeToggle() {
	const [theme, setTheme] = useState<"light" | "dark" | null>(null);

	useEffect(() => {
		const current = document.documentElement.getAttribute("data-theme");
		setTheme(current === "dark" ? "dark" : "light");
	}, []);

	function toggle() {
		const next = theme === "dark" ? "light" : "dark";
		setTheme(next);
		if (next === "dark") {
			document.documentElement.setAttribute("data-theme", "dark");
		} else {
			document.documentElement.removeAttribute("data-theme");
		}
		localStorage.setItem(STORAGE_KEY, next);
	}

	if (theme === null) {
		return <div className="w-[26px] h-[26px]" aria-hidden="true" />;
	}

	return (
		<button
			type="button"
			onClick={toggle}
			title={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
			aria-label="Toggle theme"
			className="text-dim hover:text-amber transition-colors p-1"
		>
			{theme === "dark" ? (
				<Sun size={15} strokeWidth={1.5} />
			) : (
				<Moon size={15} strokeWidth={1.5} />
			)}
		</button>
	);
}
