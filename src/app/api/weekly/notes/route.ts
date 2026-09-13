import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay()); // weeks start on Sunday
  date.setHours(0, 0, 0, 0);
  return date;
}

export async function POST(req: Request) {
  try {
    const {
      curriculumText,
      introText,
      personalNote,
      dataAsks,
      importantLinks,
      prioritiesText,
      upcomingManual,
      gifUrl,
      sideImageUrl,
      sideImagePos,
      sideImageScale,
      sideImageCaption,
      kudosText,
      calendarId,
      calendarName,
      hiddenEventIds,
      visitsOverride,
    } = await req.json();
    const weekOf = startOfWeek();

    const existing = await prisma.weeklyUpdate.findUnique({
      where: { weekOf },
      select: { status: true },
    });
    if (existing?.status === "sent") {
      return NextResponse.json({ saved: false, reason: "sent" });
    }

    const data: Record<string, unknown> = {};
    if (typeof curriculumText === "string") data.curriculumText = curriculumText;
    // introText is the new name for personalNote
    if (typeof introText === "string") data.introText = introText;
    else if (typeof personalNote === "string") data.introText = personalNote;
    if (typeof dataAsks === "string") data.dataAsks = dataAsks;
    if (typeof importantLinks === "string") data.importantLinks = importantLinks;
    if (typeof prioritiesText === "string") data.prioritiesText = prioritiesText;
    if (typeof upcomingManual === "string") data.upcomingManual = upcomingManual;
    if (typeof gifUrl === "string") data.gifUrl = gifUrl;
    if (typeof sideImageUrl === "string") data.sideImageUrl = sideImageUrl;
    if (typeof sideImagePos === "string") data.sideImagePos = sideImagePos;
    if (typeof sideImageScale === "number") data.sideImageScale = sideImageScale;
    if (typeof sideImageCaption === "string") data.sideImageCaption = sideImageCaption;
    if (typeof kudosText === "string") data.kudosText = kudosText;
    if (typeof calendarId === "string") data.calendarId = calendarId || null;
    if (typeof calendarName === "string") data.calendarName = calendarName || null;
    if (Array.isArray(hiddenEventIds)) data.hiddenEventIds = hiddenEventIds;
    if (visitsOverride && typeof visitsOverride === "object") data.visitsOverride = visitsOverride;

    // keep personalNote in sync for backwards compat
    if (typeof introText === "string") (data as Record<string, unknown>).personalNote = introText;
    else if (typeof personalNote === "string") (data as Record<string, unknown>).personalNote = personalNote;

    await prisma.weeklyUpdate.upsert({
      where: { weekOf },
      create: {
        weekOf,
        subject: "",
        bodyHtml: "",
        bodyText: "",
        recipients: [],
        ...data,
      } as never,
      update: data as never,
    });

    return NextResponse.json({ saved: true });
  } catch (err) {
    console.error("weekly notes autosave error:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}
