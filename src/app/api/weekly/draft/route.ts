import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/gmail";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  // Browser requests arrive with a NextAuth session; cron/server-to-server
  // callers use the internal secret. Accept either.
  const hasInternalSecret = req.headers.get("x-internal-secret") === INTERNAL_SECRET && Boolean(INTERNAL_SECRET);
  if (!hasInternalSecret) {
    const session = await getToken({ req: req as never, secret: process.env.NEXTAUTH_SECRET });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const body = await req.json().catch(() => ({}));
  const {
    weekOf,
    curriculumText,
    personalNote,
    introText,
    dataAsks,
    importantLinks,
    prioritiesText,
    upcomingManual,
    gifUrl,
    sideImageUrl,
    sideImagePos,
    sideImageScale,
    calendarId,
    calendarName,
    hiddenEventIds,
    html,
    text,
    recipients,
    schoolVisitsOverride,
  } = body;

  if (!weekOf || !html || !text || !recipients) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const accessToken = await getGoogleAccessToken();

    // Parse "YYYY-MM-DD" as LOCAL time — new Date(str) would use UTC midnight,
    // shifting the label/date a day back for negative-offset timezones.
    const [y, m, d] = String(weekOf).split("-").map(Number);
    const monday = new Date(y, m - 1, d);

    const weekLabel = monday.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const subject = `Weekly Update - ${weekLabel}`;

    const to = recipients.map((r: { email: string }) => r.email).join(", ");

    const mime = [
      `To: ${to}`,
      `Subject: ${subject}`,
      "Content-Type: multipart/alternative; boundary=\"weekly_update_boundary\"",
      "",
      "--weekly_update_boundary",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      text,
      "",
      "--weekly_update_boundary",
      "Content-Type: text/html; charset=UTF-8",
      "",
      html,
      "",
      "--weekly_update_boundary--",
    ].join("\r\n");

    const raw = Buffer.from(mime).toString("base64url");

    const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message: { raw } }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`Gmail draft create failed (${res.status}): ${detail.slice(0, 300)}`);
    }

    const json = (await res.json()) as { id: string; message: { id: string } };

    const intro = (introText ?? personalNote ?? null) as string | null;

    await prisma.weeklyUpdate.upsert({
      where: { weekOf: monday },
      create: {
        weekOf: monday,
        subject,
        bodyHtml: html,
        bodyText: text,
        curriculumText: curriculumText || null,
        personalNote: intro,
        introText: intro,
        dataAsks: dataAsks || null,
        importantLinks: importantLinks || null,
        prioritiesText: prioritiesText || null,
        upcomingManual: upcomingManual || null,
        sideImageUrl: sideImageUrl || null,
        sideImagePos: sideImagePos || null,
        sideImageScale: sideImageScale || null,
        calendarId: calendarId || null,
        calendarName: calendarName || null,
        hiddenEventIds: hiddenEventIds || null,
        gifUrl: gifUrl || null,
        visitsOverride: schoolVisitsOverride || null,
        recipients: { items: recipients } as unknown as Prisma.InputJsonValue,
        status: "draft",
      },
      update: {
        subject,
        bodyHtml: html,
        bodyText: text,
        curriculumText: curriculumText || null,
        personalNote: intro,
        introText: intro,
        dataAsks: dataAsks || null,
        importantLinks: importantLinks || null,
        prioritiesText: prioritiesText || null,
        upcomingManual: upcomingManual || null,
        sideImageUrl: sideImageUrl || null,
        sideImagePos: sideImagePos || null,
        sideImageScale: sideImageScale || null,
        calendarId: calendarId || null,
        calendarName: calendarName || null,
        hiddenEventIds: hiddenEventIds || null,
        gifUrl: gifUrl || null,
        visitsOverride: schoolVisitsOverride || null,
        recipients: { items: recipients } as unknown as Prisma.InputJsonValue,
        status: "draft",
      },
    });

    return NextResponse.json({ draftId: json.id, messageId: json.message.id });
  } catch (err) {
    console.error("weekly draft error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}