import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { listCalendars } from "@/lib/gcal";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const session = await getToken({ req: req as never, secret: process.env.NEXTAUTH_SECRET });
  const hasSecret = req.headers.get("x-internal-secret") === process.env.INTERNAL_API_SECRET;
  if (!session && !hasSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const calendars = await listCalendars();
    return NextResponse.json({ calendars });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to list calendars";
    return NextResponse.json({ error: msg, needsReconnect: (err as { needsReconnect?: boolean })?.needsReconnect ?? false }, { status: 500 });
  }
}
