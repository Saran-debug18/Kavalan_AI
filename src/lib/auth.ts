import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "kavalan_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12; // 12 hours

const AUTH_SECRET = process.env.AUTH_SECRET || "kavalan-dev-secret-change-me";

export interface SessionPayload {
	username: string;
	name: string;
	exp: number;
}

// ─── Password hashing (Node runtime only — used by seed + login route) ───────

export function hashPassword(password: string): string {
	const salt = randomBytes(16).toString("hex");
	const hash = scryptSync(password, salt, 64).toString("hex");
	return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
	const [salt, hash] = stored.split(":");
	if (!salt || !hash) return false;
	const candidate = scryptSync(password, salt, 64);
	const expected = Buffer.from(hash, "hex");
	if (candidate.length !== expected.length) return false;
	return timingSafeEqual(candidate, expected);
}

// ─── Session tokens (Web Crypto — works in both Node and Edge middleware) ────

function b64urlEncode(bytes: Uint8Array): string {
	let str = "";
	for (const b of bytes) str += String.fromCharCode(b);
	return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
	const padded = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(
		s.length + ((4 - (s.length % 4)) % 4),
		"=",
	);
	const str = atob(padded);
	const bytes = new Uint8Array(str.length);
	for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
	return bytes;
}

async function getHmacKey(): Promise<CryptoKey> {
	const enc = new TextEncoder().encode(AUTH_SECRET);
	return crypto.subtle.importKey(
		"raw",
		enc as BufferSource,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["sign", "verify"],
	);
}

export async function createSessionToken(
	username: string,
	name: string,
): Promise<string> {
	const payload: SessionPayload = {
		username,
		name,
		exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
	};
	const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
	const payloadB64 = b64urlEncode(payloadBytes);
	const key = await getHmacKey();
	const sig = await crypto.subtle.sign("HMAC", key, payloadBytes as BufferSource);
	const sigB64 = b64urlEncode(new Uint8Array(sig));
	return `${payloadB64}.${sigB64}`;
}

export async function verifySessionToken(
	token: string | undefined | null,
): Promise<SessionPayload | null> {
	if (!token) return null;
	const [payloadB64, sigB64] = token.split(".");
	if (!payloadB64 || !sigB64) return null;
	try {
		const payloadBytes = b64urlDecode(payloadB64);
		const sigBytes = b64urlDecode(sigB64);
		const key = await getHmacKey();
		const valid = await crypto.subtle.verify(
			"HMAC",
			key,
			sigBytes as BufferSource,
			payloadBytes as BufferSource,
		);
		if (!valid) return null;
		const payload = JSON.parse(
			new TextDecoder().decode(payloadBytes),
		) as SessionPayload;
		if (payload.exp < Math.floor(Date.now() / 1000)) return null;
		return payload;
	} catch {
		return null;
	}
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS;

/**
 * Resolves the logged-in analyst's name from the session cookie on a Route
 * Handler request. Falls back to "Unknown Analyst" if the cookie is missing
 * or invalid — routes are already gated by middleware, so this should only
 * happen for direct/unauthenticated API calls in edge cases.
 */
export async function getSessionAgentName(request: NextRequest): Promise<string> {
	const token = request.cookies.get(SESSION_COOKIE)?.value;
	const session = await verifySessionToken(token);
	return session?.name ?? "Unknown Analyst";
}
