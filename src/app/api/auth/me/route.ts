export const dynamic = "force-dynamic";
import { NextResponse, type NextRequest } from "next/server";
import { verifySessionToken, SESSION_COOKIE } from "@/lib/auth";

export async function GET(request: NextRequest) {
	const token = request.cookies.get(SESSION_COOKIE)?.value;
	const session = await verifySessionToken(token);
	if (!session) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}
	return NextResponse.json({ username: session.username, name: session.name });
}
