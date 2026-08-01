"use client";

import {
	createContext,
	useCallback,
	useContext,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, XCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastVariant = "success" | "error" | "info";

interface ToastItem {
	id: number;
	message: string;
	variant: ToastVariant;
}

interface ToastContextValue {
	success: (message: string) => void;
	error: (message: string) => void;
	info: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_STYLE: Record<
	ToastVariant,
	{ icon: typeof CheckCircle2; border: string; text: string }
> = {
	success: { icon: CheckCircle2, border: "border-sage", text: "text-sage" },
	error: { icon: XCircle, border: "border-crimson", text: "text-crimson" },
	info: { icon: Info, border: "border-sky", text: "text-sky" },
};

const DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const idRef = useRef(0);

	const dismiss = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const push = useCallback(
		(variant: ToastVariant, message: string) => {
			const id = ++idRef.current;
			setToasts((prev) => [...prev, { id, message, variant }]);
			setTimeout(() => dismiss(id), DURATION_MS);
		},
		[dismiss],
	);

	const value: ToastContextValue = {
		success: (m) => push("success", m),
		error: (m) => push("error", m),
		info: (m) => push("info", m),
	};

	return (
		<ToastContext.Provider value={value}>
			{children}
			<div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
				<AnimatePresence>
					{toasts.map((t) => {
						const { icon: Icon, border, text } = VARIANT_STYLE[t.variant];
						return (
							<motion.div
								key={t.id}
								initial={{ opacity: 0, y: -8, scale: 0.98 }}
								animate={{ opacity: 1, y: 0, scale: 1 }}
								exit={{ opacity: 0, y: -8, scale: 0.98 }}
								transition={{ duration: 0.2, ease: "easeOut" }}
								className={cn(
									"pointer-events-auto flex items-start gap-2.5 bg-surface-1 border px-3.5 py-3 shadow-lg",
									border,
								)}
							>
								<Icon size={16} strokeWidth={1.5} className={cn("shrink-0 mt-0.5", text)} />
								<p className="flex-1 text-sm text-data leading-snug">{t.message}</p>
								<button
									type="button"
									onClick={() => dismiss(t.id)}
									className="shrink-0 text-dim hover:text-data"
									aria-label="Dismiss"
								>
									<X size={14} strokeWidth={1.5} />
								</button>
							</motion.div>
						);
					})}
				</AnimatePresence>
			</div>
		</ToastContext.Provider>
	);
}

export function useToast(): ToastContextValue {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within a ToastProvider");
	return ctx;
}
