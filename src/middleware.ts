import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

const PUBLIC_PATHS = [
	"/login",
	// PWA assets — must be fetchable without a session, both because the OS
	// checks installability (manifest + icons) before any login happens, and
	// because a service worker's own script request is always unauthenticated.
	"/manifest.json",
	"/sw.js",
	"/icon.svg",
	"/icon-192.png",
	"/icon-512.png",
	"/icon-maskable-512.png",
	"/apple-touch-icon.png",
];
const PUBLIC_API_PREFIXES = ["/api/auth/"];

export async function middleware(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
	if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p)))
		return NextResponse.next();

	const token = request.cookies.get(SESSION_COOKIE)?.value;
	const session = await verifySessionToken(token);

	if (!session) {
		if (pathname.startsWith("/api/")) {
			return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
		}
		const loginUrl = new URL("/login", request.url);
		loginUrl.searchParams.set("next", pathname);
		return NextResponse.redirect(loginUrl);
	}

	return NextResponse.next();
}

export const config = {
	matcher: [
		/*
		 * Match all paths except:
		 * - _next/static, _next/image (build assets)
		 * - favicon.ico
		 */
		"/((?!_next/static|_next/image|favicon.ico).*)",
	],
};
