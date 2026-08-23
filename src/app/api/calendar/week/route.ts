import { NextResponse } from "next/server";
import { listEvents, CalendarNotReadyError } from "@/lib/gcal";

export const dynamic = "force-dynamic";

interface DayBucket {
  date: string;          // YYYY-MM-DD
  weekday: string;       // Mon
  dayOfMonth: number;
  isToday: boolean;
  events: ReturnType<typeof shapeEvent>[];
}

function shapeEvent(e: Awaited<ReturnType<typeof import("@/lib/gcal").listEvents>>[number]) {
  return {
    id: e.id,
    title: e.title,
    start: e.startISO,
    end: e.endISO,
    allDay: e.allDay,
    location: e.location,
    meetLink: e.meetLink,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const startParam = url.searchParams.get("start"); // YYYY-MM-DD of week's Monday

  // Sunday of the requested (or current) week, in server-local time.
  const base = startParam ? new Date(`${startParam}T12:00:00`) : new Date();
  if (isNaN(base.getTime())) {
    return NextResponse.json({ error: "Invalid ?start date" }, { status: 400 });
  }
  const sunday = new Date(base);
  sunday.setDate(sunday.getDate() - sunday.getDay()); // 0 = Sunday
  sunday.setHours(0, 0, 0, 0);

  const saturday = new Date(sunday);
  saturday.setDate(saturday.getDate() + 7);

  try {
    const events = await listEvents(sunday.toISOString(), saturday.toISOString());

    const todayStr = new Date().toDateString();
    const days: DayBucket[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(sunday);
      d.setDate(d.getDate() + i);
      days.push({
        date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
        weekday: d.toLocaleDateString("en-US", { weekday: "short" }),
        dayOfMonth: d.getDate(),
        isToday: d.toDateString() === todayStr,
        events: [],
      });
    }
    for (const e of events) {
      const d = new Date(e.startISO);
      const bucket = days.find((b) => new Date(`${b.date}T12:00:00`).toDateString() === d.toDateString());
      if (bucket) bucket.events.push(shapeEvent(e));
    }
    for (const b of days) {
      b.events.sort((a, z) => (a.allDay ? -1 : 1) - (z.allDay ? -1 : 1) || new Date(a.start).getTime() - new Date(z.start).getTime());
    }

    return NextResponse.json({
      weekStart: days[0].date,
      weekEnd: days[6].date,
      label: `${sunday.toLocaleDateString("en-US", { month: "long", day: "numeric" })} – ${new Date(saturday.getTime() - 1).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
      days,
    });
  } catch (err) {
    if (err instanceof CalendarNotReadyError) {
      return NextResponse.json(
        { error: err.message, needsReconnect: err.needsReconnect, reason: err.reason },
        { status: 400 },
      );
    }
    console.error("calendar week failed:", err);
    return NextResponse.json({ error: "Failed to load calendar" }, { status: 500 });
  }
}
