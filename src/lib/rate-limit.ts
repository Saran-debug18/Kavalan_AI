interface AttemptRecord {
	count: number;
	firstAttemptAt: number;
	lockedUntil: number | null;
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS = 5;

// In-memory — fine for a single-process deployment. Resets on restart and
// does not coordinate across multiple instances; a real multi-instance
// deployment would move this to Redis or similar.
const attempts = new Map<string, AttemptRecord>();

export interface RateLimitResult {
	allowed: boolean;
	retryAfterSeconds?: number;
}

export function checkLoginRateLimit(key: string): RateLimitResult {
	const now = Date.now();
	const record = attempts.get(key);

	if (!record) return { allowed: true };

	if (record.lockedUntil && record.lockedUntil > now) {
		return {
			allowed: false,
			retryAfterSeconds: Math.ceil((record.lockedUntil - now) / 1000),
		};
	}

	// Window expired — reset.
	if (now - record.firstAttemptAt > WINDOW_MS) {
		attempts.delete(key);
		return { allowed: true };
	}

	return { allowed: true };
}

export function recordFailedLogin(key: string): void {
	const now = Date.now();
	const record = attempts.get(key);

	if (!record || now - record.firstAttemptAt > WINDOW_MS) {
		attempts.set(key, { count: 1, firstAttemptAt: now, lockedUntil: null });
		return;
	}

	const count = record.count + 1;
	const lockedUntil = count >= MAX_ATTEMPTS ? now + LOCKOUT_MS : null;
	attempts.set(key, { ...record, count, lockedUntil });
}

export function clearLoginAttempts(key: string): void {
	attempts.delete(key);
}
