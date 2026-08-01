export const dynamic = "force-dynamic";
import { type NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
	verifyPassword,
	createSessionToken,
	SESSION_COOKIE,
	SESSION_MAX_AGE,
} from "@/lib/auth";
import {
	checkLoginRateLimit,
	recordFailedLogin,
	clearLoginAttempts,
} from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
	try {
		const body = await request.json().catch(() => ({}));
		const username = String(body.username ?? "").trim().toLowerCase();
		const password = String(body.password ?? "");

		if (!username || !password) {
			return NextResponse.json(
				{ error: "Username and password are required." },
				{ status: 400 },
			);
		}

		const rateLimit = checkLoginRateLimit(username);
		if (!rateLimit.allowed) {
			const minutes = Math.ceil((rateLimit.retryAfterSeconds ?? 60) / 60);
			return NextResponse.json(
				{
					error: `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
				},
				{ status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds ?? 60) } },
			);
		}

		const analyst = db
			.prepare("SELECT * FROM analysts WHERE username = ?")
			.get(username) as
			| { username: string; name: string; passwordHash: string }
			| undefined;

		if (!analyst || !verifyPassword(password, analyst.passwordHash)) {
			recordFailedLogin(username);
			return NextResponse.json(
				{ error: "Invalid username or password." },
				{ status: 401 },
			);
		}

		clearLoginAttempts(username);
		const token = await createSessionToken(analyst.username, analyst.name);
		const res = NextResponse.json({ username: analyst.username, name: analyst.name });
		res.cookies.set(SESSION_COOKIE, token, {
			httpOnly: true,
			sameSite: "lax",
			secure: process.env.NODE_ENV === "production",
			path: "/",
			maxAge: SESSION_MAX_AGE,
		});
		return res;
	} catch (error) {
		return NextResponse.json({ error: String(error) }, { status: 500 });
	}
}
