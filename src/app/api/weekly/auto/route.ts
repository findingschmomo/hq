import { NextResponse } from "next/server";
import { compileWeeklyData, renderWeeklyHtml, renderWeeklyText } from "@/lib/weekly";
import { prisma } from "@/lib/prisma";
import { getGoogleAccessToken } from "@/lib/gmail";

const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = req.headers.get("x-internal-secret");
  if (secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const data = await compileWeeklyData();

    const lastUpdate = await prisma.weeklyUpdate.findFirst({
      where: { status: "sent" },
      orderBy: { weekOf: "desc" },
      select: { curriculumText: true, personalNote: true, gifUrl: true },
    });

    const curriculumText = lastUpdate?.curriculumText || data.lastCurriculumText || "";
    const personalNote = lastUpdate?.personalNote || data.lastPersonalNote || "";
    const gifUrl = lastUpdate?.gifUrl || "";

    const html = renderWeeklyHtml(data, curriculumText, personalNote, gifUrl);
    const text = renderWeeklyText(data, curriculumText, personalNote, gifUrl);

    const accessToken = await getGoogleAccessToken();

    const weekLabel = data.weekOf.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const subject = `Weekly Update — ${weekLabel}`;

    const to = data.recipients.map((r) => r.email).join(", ");

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

    const monday = data.weekOf;

    await prisma.weeklyUpdate.upsert({
      where: { weekOf: monday },
      create: {
        weekOf: monday,
        subject,
        bodyHtml: html,
        bodyText: text,
        curriculumText,
        personalNote,
        gifUrl,
        visitsOverride: undefined,
        recipients: { items: data.recipients } as any,
        status: "draft",
      },
      update: {
        subject,
        bodyHtml: html,
        bodyText: text,
        curriculumText,
        personalNote,
        gifUrl,
        visitsOverride: undefined,
        recipients: { items: data.recipients } as any,
        status: "draft",
      },
    });

    return NextResponse.json({ success: true, draftId: json.id, weekOf: monday.toISOString().split("T")[0] });
  } catch (err) {
    console.error("weekly auto error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}