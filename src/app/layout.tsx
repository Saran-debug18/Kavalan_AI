import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ToastProvider } from "@/components/ui/Toast";
import ConditionalShell from "@/components/layout/ConditionalShell";
import PwaRegister from "@/components/PwaRegister";

export const metadata: Metadata = {
	title: "KAVALAN | Forensic Intelligence System",
	description:
		"AI-Powered Forensic Triage & Postmortem Intelligence System — advanced case management, autopsy analysis, time-of-death estimation, and digital evidence correlation.",
	manifest: "/manifest.json",
	icons: {
		icon: [
			{ url: "/icon-192.png", sizes: "192x192", type: "image/png" },
			{ url: "/icon-512.png", sizes: "512x512", type: "image/png" },
		],
		apple: "/apple-touch-icon.png",
	},
	appleWebApp: {
		capable: true,
		statusBarStyle: "black-translucent",
		title: "KAVALAN",
	},
};

export const viewport: Viewport = {
	themeColor: "#16171a",
	width: "device-width",
	initialScale: 1,
};

const THEME_INIT_SCRIPT = `
(function () {
	try {
		var stored = localStorage.getItem("kavalan-theme");
		var theme = stored || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
		if (theme === "dark") document.documentElement.setAttribute("data-theme", "dark");
	} catch (e) {}
})();
`;

export default function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	return (
		<html lang="en">
			<head>
				<script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
			</head>
			<body style={{ background: "var(--bg)" }}>
				<PwaRegister />
				<ToastProvider>
					<ConditionalShell>{children}</ConditionalShell>
				</ToastProvider>
			</body>
		</html>
	);
}
