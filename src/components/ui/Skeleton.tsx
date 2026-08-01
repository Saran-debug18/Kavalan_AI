import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
	return (
		<div
			className={cn("animate-pulse bg-surface-2 rounded-sm", className)}
			aria-hidden="true"
		/>
	);
}

export function StatsStripSkeleton() {
	return (
		<div className="grid grid-cols-2 sm:flex w-full border border-border-DEFAULT bg-surface-1">
			{Array.from({ length: 5 }).map((_, i) => (
				<div
					key={i}
					className={cn(
						"flex sm:flex-1 flex-col justify-center gap-2 px-4 sm:px-6 py-3 sm:py-4",
						i % 2 === 0 && "border-r",
						i < 3 && "border-b sm:border-b-0",
						i === 4 && "col-span-2 sm:col-span-1 border-r-0",
						i < 4 && "sm:border-r",
						"border-border-DEFAULT",
					)}
				>
					<Skeleton className="h-3 w-20" />
					<Skeleton className="h-6 w-10" />
				</div>
			))}
		</div>
	);
}

export function CardSkeleton({ className }: { className?: string }) {
	return (
		<div className={cn("border border-border-DEFAULT bg-surface-1 p-4", className)}>
			<Skeleton className="h-3 w-32 mb-4" />
			<div className="flex flex-col gap-3">
				<Skeleton className="h-4 w-full" />
				<Skeleton className="h-4 w-5/6" />
				<Skeleton className="h-4 w-4/6" />
			</div>
		</div>
	);
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
	return (
		<div className="w-full border border-border-DEFAULT">
			<div className="flex items-center gap-4 px-3 py-2 border-b border-border-DEFAULT bg-surface-1">
				{Array.from({ length: 5 }).map((_, i) => (
					<Skeleton key={i} className="h-3 flex-1" />
				))}
			</div>
			{Array.from({ length: rows }).map((_, i) => (
				<div
					key={i}
					className="flex items-center gap-4 px-3 py-3 border-t border-border-DEFAULT"
				>
					{Array.from({ length: 5 }).map((_, j) => (
						<Skeleton key={j} className="h-3.5 flex-1" />
					))}
				</div>
			))}
		</div>
	);
}

export function CaseCardListSkeleton({ rows = 5 }: { rows?: number }) {
	return (
		<div className="flex flex-col gap-2">
			{Array.from({ length: rows }).map((_, i) => (
				<div
					key={i}
					className="border border-border-DEFAULT bg-surface-1 p-3 flex flex-col gap-2"
				>
					<div className="flex items-center justify-between gap-2">
						<Skeleton className="h-3 w-24" />
						<Skeleton className="h-4 w-16" />
					</div>
					<Skeleton className="h-4 w-4/5" />
					<Skeleton className="h-3 w-3/5" />
				</div>
			))}
		</div>
	);
}

export function DashboardSkeleton() {
	return (
		<div className="p-4 md:p-6">
			<StatsStripSkeleton />
			<div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
				<CardSkeleton className="lg:col-span-1" />
				<CardSkeleton className="lg:col-span-2" />
			</div>
			<div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
				<CardSkeleton className="lg:col-span-2" />
				<CardSkeleton className="lg:col-span-1" />
			</div>
		</div>
	);
}

export function CasesPageSkeleton() {
	return (
		<div className="p-4 md:p-6">
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<Skeleton className="h-6 w-64" />
			</div>
			<Skeleton className="h-3 w-32 mb-2" />
			<div className="md:hidden">
				<CaseCardListSkeleton />
			</div>
			<div className="hidden md:block">
				<TableSkeleton />
			</div>
		</div>
	);
}

export function CaseWorkspaceSkeleton() {
	return (
		<>
			<div className="h-14 flex items-center px-4 md:px-6 border-b border-border-DEFAULT bg-surface-1 gap-3">
				<div className="flex flex-col gap-1.5">
					<Skeleton className="h-3.5 w-32" />
					<Skeleton className="h-3 w-48" />
				</div>
			</div>
			<div className="px-4 md:px-6 py-3 border-b border-border-DEFAULT bg-surface-1 flex gap-4">
				{Array.from({ length: 5 }).map((_, i) => (
					<Skeleton key={i} className="h-3 w-20" />
				))}
			</div>
			<div className="p-4 md:p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
				<CardSkeleton className="lg:col-span-2" />
				<CardSkeleton className="lg:col-span-1" />
			</div>
		</>
	);
}
