import { NextResponse } from "next/server";
import { compileWeeklyData, renderWeeklyHtml, renderWeeklyText } from "@/lib/weekly";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const weekOfParam = searchParams.get("weekOf");
  const scopePod = searchParams.get("pod");
  const weekOf = weekOfParam
    ? (() => {
        const [y, m, d] = weekOfParam.split("-").map(Number);
        return new Date(y, m - 1, d);
      })()
    : undefined;

  try {
    const data = await compileWeeklyData(weekOf, scopePod);

    // For editor prefill: use stored values for this week, falling back to last sent
    const introText = data.introText ?? data.lastPersonalNote ?? "";
    const curriculumText = data.curriculumText ?? data.lastCurriculumText ?? "";
    const dataAsks = data.dataAsks ?? "";
    const importantLinks = data.importantLinks ?? "";
    const prioritiesText = data.prioritiesText ?? "";
    const upcomingManual = data.upcomingManual ?? "";
    const gifUrl = data.gifUrl ?? "";
    const sideImageUrl = data.sideImageUrl ?? "";
    const sideImagePos = data.sideImagePos ?? "50% 50%";
    const sideImageScale = data.sideImageScale ?? 100;
    const sideImageCaption = data.sideImageCaption ?? "";
    const kudosText = data.kudosText ?? "";

    const html = renderWeeklyHtml(data, curriculumText, introText, gifUrl);
    const text = renderWeeklyText(data, curriculumText, introText, gifUrl);

    return NextResponse.json({
      weekOf: data.weekOf.toISOString().split("T")[0],
      recipients: data.recipients,
      priorities: data.priorities,
      sharedTasks: data.sharedTasks,
      upcomingEvents: data.upcomingEvents,
      schoolVisits: data.schoolVisits,
      horizonEvents: data.horizonEvents,
      // Canva fields (for editor)
      introText,
      curriculumText,
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
      calendarId: data.calendarId,
      calendarName: data.calendarName,
      hiddenEventIds: data.hiddenEventIds,
      // deprecated kept for compat
      personalNote: introText,
      visitsOverride: null,
      html,
      text,
    });
  } catch (err) {
    console.error("weekly preview error:", err);
    return NextResponse.json({ error: "Failed to compile weekly data" }, { status: 500 });
  }
}
