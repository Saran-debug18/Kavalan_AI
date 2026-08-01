function csvCell(v: unknown): string {
	const s = v === null || v === undefined ? "" : String(v);
	if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
	return s;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
	const header = columns.map(csvCell).join(",");
	const body = rows
		.map((row) => columns.map((c) => csvCell(row[c])).join(","))
		.join("\n");
	return `${header}\n${body}`;
}

export function downloadFile(filename: string, content: string, mime: string): void {
	const blob = new Blob([content], { type: mime });
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}

export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns: string[]): void {
	downloadFile(filename, toCsv(rows, columns), "text/csv;charset=utf-8;");
}

export function downloadText(filename: string, content: string): void {
	downloadFile(filename, content, "text/plain;charset=utf-8;");
}
