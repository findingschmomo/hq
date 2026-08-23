import { NextResponse } from "next/server";
import { listEvents, CalendarNotReadyError } from "@/lib/gcal";
import { logMeetingTouchpoints } from "@/lib/touchpoints";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** POST /api/stakeholders/sync-meetings — scan the calendar (default: last
    30 days + next 7) and log any events that include a stakeholder as a
    "meeting" touchpoint. Safe to re-run; duplicates are skipped. */
export async function POST(req: Request) {
  const url = new URL(req.url);
  const days = Math.min(Math.max(Number(url.searchParams.get("days")) || 30, 1), 365);

  const start = new Date();
  start.setDate(start.getDate() - days);
  const end = new Date();
  end.setDate(end.getDate() + 7);

  try {
    const events = await listEvents(start.toISOString(), end.toISOString());
    const logged = await logMeetingTouchpoints(events);
    return NextResponse.json({ ok: true, scanned: events.length, logged, from: start.toISOString().slice(0, 10) });
  } catch (err) {
    if (err instanceof CalendarNotReadyError) {
      return NextResponse.json({ error: err.message, needsReconnect: err.needsReconnect }, { status: 400 });
    }
    console.error("meeting sync failed:", err);
    return NextResponse.json({ error: "Failed to sync meetings" }, { status: 500 });
  }
}
