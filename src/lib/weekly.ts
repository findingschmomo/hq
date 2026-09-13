import { prisma } from "@/lib/prisma";
import { listEvents, CalEvent } from "@/lib/gcal";
import { H_LOGO_DATA_URI } from "@/lib/hLogo";

export interface WeeklyRecipient {
  id: string;
  name: string;
  email: string;
}

export interface WeeklyTask {
  id: string;
  name: string;
  status: string;
  priority: string;
  dueDate: Date | null;
  delegateeName: string;
}

export interface WeeklySchoolVisit {
  schoolName: string;
  events: { title: string; startISO: string; location: string | null }[];
}

export interface HorizonEvent {
  title: string;
  startISO: string;
  location: string | null;
}

export interface CompiledWeeklyData {
  weekOf: Date;
  recipients: WeeklyRecipient[];
  priorities: WeeklyTask[];
  sharedTasks: WeeklyTask[];
  upcomingEvents: CalEvent[];
  schoolVisits: WeeklySchoolVisit[];
  horizonEvents: HorizonEvent[];
  // editable fields for this week (Canva template)
  introText: string | null;
  curriculumText: string | null;
  dataAsks: string | null;
  importantLinks: string | null;
  prioritiesText: string | null;
  upcomingManual: string | null;
  gifUrl: string | null;
  sideImageUrl: string | null;
  sideImagePos: string | null;
  sideImageScale: number | null;
  sideImageCaption: string | null;
  kudosText: string | null;
  calendarId: string | null;
  calendarName: string | null;
  hiddenEventIds: string[];
  lastCurriculumText: string | null;
  lastPersonalNote: string | null;
}

function startOfWeek(d = new Date()): Date {
  const date = new Date(d);
  date.setDate(date.getDate() - date.getDay()); // weeks start on Sunday
  date.setHours(0, 0, 0, 0);
  return date;
}

function endOfWeek(monday: Date): Date {
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  return sunday;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export async function compileWeeklyData(weekOf?: Date, scopePod?: string | null): Promise<CompiledWeeklyData> {
  const monday = weekOf ? startOfWeek(weekOf) : startOfWeek();
  const sunday = endOfWeek(monday);
  // Rolling window: current week + the next three (four weeks total), not calendar month
  const fourWeeksEnd = new Date(monday);
  fourWeeksEnd.setDate(fourWeeksEnd.getDate() + 28);
  fourWeeksEnd.setHours(0, 0, 0, 0);

  const recipients: WeeklyRecipient[] = [];
  // Scope: if Pod name provided, only that Pod's coordinators; else all direct reports (legacy) or all coordinators
  let scopeNames: string[] | null = null;
  if (scopePod) {
    const pod = await prisma.pod.findFirst({
      where: { name: scopePod },
      include: { schools: { include: { members: { select: { name: true } } } } },
    });
    if (pod) {
      scopeNames = pod.schools.flatMap((s) => s.members.map((m) => m.name));
      // Also include director? No, coordinators only
    }
  }
  const reports = await prisma.stakeholder.findMany({
    where: scopePod && scopeNames ? { name: { in: scopeNames }, archived: false } : { isDirectReport: true, archived: false, email: { not: null } },
    select: { id: true, name: true, email: true },
  });
  for (const r of reports) {
    if (r.email || scopePod) recipients.push({ id: r.id, name: r.name, email: r.email || "" });
  }
  // For org-wide "all" with 19 coordinators, if no scopePod and we want all, we could use all school members
  if (!scopePod) {
    // Keep legacy direct reports as recipients for email, but shared logic below will use scopeNames if provided
  }

  const allTasks = await prisma.task.findMany({
    where: { status: { not: "Done" } },
    include: { delegatee: { select: { name: true } } },
  });

  const weekTasks: WeeklyTask[] = [];
  const monthTasksByPerson: Record<string, WeeklyTask[]> = {};

  for (const t of allTasks) {
    const due = t.dueDate ? new Date(t.dueDate) : null;
    const delegateeName = t.delegatee?.name || "Unassigned";
    const wt: WeeklyTask = {
      id: t.id,
      name: t.name,
      status: t.status,
      priority: t.priority,
      dueDate: due,
      delegateeName,
    };

    if (due && due >= monday && due <= sunday && t.priority === "High") {
      weekTasks.push(wt);
    }

    if (due && due >= monday && due < fourWeeksEnd) {
      const ownerName = delegateeName !== "Unassigned" ? delegateeName : "Me";
      if (!monthTasksByPerson[ownerName]) monthTasksByPerson[ownerName] = [];
      monthTasksByPerson[ownerName].push(wt);
    } else if (!due && delegateeName !== "Unassigned") {
      if (!monthTasksByPerson[delegateeName]) monthTasksByPerson[delegateeName] = [];
      monthTasksByPerson[delegateeName].push(wt);
    } else if (!due && delegateeName === "Unassigned") {
      if (!monthTasksByPerson["Me"]) monthTasksByPerson["Me"] = [];
      monthTasksByPerson["Me"].push(wt);
    }
  }

  // Filter out "Me" — only keep delegated tasks for the team section
  const teamTasksByPerson: Record<string, WeeklyTask[]> = {};
  for (const [person, tasks] of Object.entries(monthTasksByPerson)) {
    if (person !== "Me") {
      teamTasksByPerson[person] = tasks;
    }
  }

  // The update goes to the whole team, so only tasks assigned to EVERY recipient are included.
  // If pod scope is set, use that pod's coordinator names
  const recipientNames = scopeNames ?? recipients.map((r) => r.name);
  const candidates = new Map<string, WeeklyTask>();
  for (const tasks of Object.values(teamTasksByPerson)) {
    for (const t of tasks) {
      if (!candidates.has(t.name)) candidates.set(t.name, t);
    }
  }
  const sharedTasks: WeeklyTask[] = [];
  for (const [name, task] of candidates) {
    if (recipientNames.length > 0 && recipientNames.every((rn) => (teamTasksByPerson[rn] || []).some((t) => t.name === name))) {
      sharedTasks.push(task);
    }
  }

  // Priorities: shared, high-priority, due this week — one entry per task name.
  weekTasks.sort((a, b) => (a.dueDate?.getTime() ?? 0) - (b.dueDate?.getTime() ?? 0));
  const priorities: WeeklyTask[] = [];
  for (const t of weekTasks) {
    if (sharedTasks.some((s) => s.name === t.name) && !priorities.some((p) => p.name === t.name)) {
      priorities.push(t);
    }
  }

  // A task shown under Priorities shouldn't repeat in the monthly list.
  const monthlyShared = sharedTasks.filter((t) => !priorities.some((p) => p.name === t.name));

  // Load stored Canva fields for this week (for hybrid / prefill)
  const stored = await prisma.weeklyUpdate.findUnique({
    where: { weekOf: monday },
    select: {
      introText: true,
      curriculumText: true,
      dataAsks: true,
      importantLinks: true,
      prioritiesText: true,
      upcomingManual: true,
      gifUrl: true,
      sideImageUrl: true,
      sideImagePos: true,
      sideImageScale: true,
      sideImageCaption: true,
      kudosText: true,
      calendarId: true,
      calendarName: true,
      hiddenEventIds: true,
      personalNote: true,
    },
  });

  // Upcoming Events from selected calendar (Programming Calendar etc.)
  let upcomingEvents: CalEvent[] = [];
  const calId = stored?.calendarId || null;
  if (calId) {
    try {
      upcomingEvents = await listEvents(monday.toISOString(), fourWeeksEnd.toISOString(), calId);
    } catch {
      // calendar not connected or error — keep empty
    }
  } else {
    // No calendar chosen yet — try primary as preview, but don't fail if not connected
    try {
      upcomingEvents = await listEvents(monday.toISOString(), fourWeeksEnd.toISOString(), "primary");
    } catch {
      upcomingEvents = [];
    }
  }
  // Safety filter: Google sometimes returns out-of-window recurring instances
  upcomingEvents = upcomingEvents.filter((e) => {
    const s = new Date(e.startISO);
    return s >= monday && s < fourWeeksEnd;
  });
  const hiddenIds = new Set<string>((stored?.hiddenEventIds as string[] | null) ?? []);

  // Deprecated sections kept for backwards compat (now empty)
  const schoolVisits: WeeklySchoolVisit[] = [];
  const horizonEvents: HorizonEvent[] = [];

  const lastUpdate = await prisma.weeklyUpdate.findFirst({
    where: { weekOf: { not: monday } },
    orderBy: { weekOf: "desc" },
    select: {
      introText: true,
      curriculumText: true,
      dataAsks: true,
      importantLinks: true,
      prioritiesText: true,
      upcomingManual: true,
      gifUrl: true,
      sideImageUrl: true,
      sideImagePos: true,
      sideImageScale: true,
      sideImageCaption: true,
      kudosText: true,
      calendarId: true,
      calendarName: true,
      personalNote: true,
    },
  });

  // Use stored if it has real content (non-empty after trim), else fall back to last week
  const pick = (a: string | null | undefined, b: string | null | undefined) =>
    a && a.trim() ? a : b && b.trim() ? b : null;

  return {
    weekOf: monday,
    recipients,
    priorities,
    sharedTasks: monthlyShared,
    upcomingEvents,
    schoolVisits,
    horizonEvents: horizonEvents.slice(0, 10),
    introText: pick(stored?.introText, lastUpdate?.introText ?? lastUpdate?.personalNote) ?? null,
    curriculumText: pick(stored?.curriculumText, lastUpdate?.curriculumText) ?? null,
    dataAsks: pick(stored?.dataAsks, lastUpdate?.dataAsks) ?? null,
    importantLinks: pick(stored?.importantLinks, lastUpdate?.importantLinks) ?? null,
    prioritiesText: pick(stored?.prioritiesText, lastUpdate?.prioritiesText) ?? null,
    upcomingManual: pick(stored?.upcomingManual, lastUpdate?.upcomingManual) ?? null,
    gifUrl: pick(stored?.gifUrl, lastUpdate?.gifUrl) ?? null,
    sideImageUrl: pick(stored?.sideImageUrl, lastUpdate?.sideImageUrl) ?? null,
    sideImagePos: stored?.sideImagePos ?? lastUpdate?.sideImagePos ?? "50% 50%",
    sideImageScale: stored?.sideImageScale ?? lastUpdate?.sideImageScale ?? 100,
    sideImageCaption: pick(stored?.sideImageCaption, lastUpdate?.sideImageCaption) ?? null,
    kudosText: pick(stored?.kudosText, lastUpdate?.kudosText) ?? null,
    calendarId: stored?.calendarId ?? lastUpdate?.calendarId ?? null,
    calendarName: stored?.calendarName ?? lastUpdate?.calendarName ?? null,
    hiddenEventIds: [...hiddenIds],
    lastCurriculumText: lastUpdate?.curriculumText || lastUpdate?.introText || null,
    lastPersonalNote: lastUpdate?.personalNote || null,
  };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, String.fromCharCode(38) + "amp;")
    .replace(/</g, String.fromCharCode(38) + "lt;")
    .replace(/>/g, String.fromCharCode(38) + "gt;")
    .replace(/"/g, String.fromCharCode(38) + "quot;")
    .replace(/'/g, String.fromCharCode(38) + "#039;");
}

/** Escape plain text, then turn [labels](urls) and bare URLs into links. Newlines become <br>. */
function richTextToHtml(text: string, opts: { linkColor?: string } = {}): string {
  const linkColor = opts.linkColor ?? "#ffffff";
  const escaped = escapeHtml(text);
  const anchors: string[] = [];
  const withPlaceholders = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    (_m, label: string, url: string) => {
      anchors.push(`<a href="${url}" target="_blank" rel="noreferrer" style="color:${linkColor}; text-decoration:underline; text-underline-offset:2px;">${label}</a>`);
      return `\u0000${anchors.length - 1}\u0000`;
    }
  );
  const autoLinked = withPlaceholders.replace(
    /(^|[\s(])(https?:\/\/[^\s<)]+)/g,
    (_m, pre: string, url: string) =>
      `${pre}<a href="${url}" target="_blank" rel="noreferrer" style="color:${linkColor}; text-decoration:underline; text-underline-offset:2px;">${url}</a>`
  );
  return autoLinked
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => anchors[Number(i)])
    .replace(/\n/g, "<br>");
}

function formatEventDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function renderWeeklyHtml(data: CompiledWeeklyData, curriculumText: string, personalNote: string, gifUrl?: string): string {
  // Backwards compat: personalNote may be introText
  const intro = (data.introText ?? personalNote ?? "").trim();
  const curriculum = (curriculumText ?? data.curriculumText ?? "").trim();
  const dataAsks = (data.dataAsks ?? "").trim();
  const upcomingManual = (data.upcomingManual ?? "").trim();
  const importantLinks = (data.importantLinks ?? "").trim();
  const prioritiesOverride = (data.prioritiesText ?? "").trim();
  const sideImageCaption = (data.sideImageCaption ?? "").trim();
  const kudosOverride = (data.kudosText ?? "").trim();

  const weekLabel = data.weekOf.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const hasIntro = intro.length > 0;
  const hasCurriculum = curriculum.length > 0;
  const hasDataAsks = dataAsks.length > 0;
  const hasImportantLinks = importantLinks.length > 0;

  // Priorities bubble — hybrid: manual override wins, else auto from shared high-priority tasks
  let prioritiesHtml: string;
  if (prioritiesOverride) {
    prioritiesHtml = richTextToHtml(prioritiesOverride, { linkColor: "#0F1F3C" });
  } else if (data.priorities.length === 0) {
    prioritiesHtml = `<span style="color:#6b7280; font-style:italic;">No priorities set for this week.</span>`;
  } else {
    prioritiesHtml = `<ul style="margin:0; padding-left:18px; color:#1e293b;">${data.priorities
      .map((t) => `<li style="margin:4px 0; font-size:13px;">${escapeHtml(t.name)}<span style="color:#64748b; font-size:11px;"> ${t.dueDate ? `— ${formatDateTime(t.dueDate.toISOString())}` : ""}</span></li>`)
      .join("")}</ul>`;
  }

  // Upcoming Events — calendar events + manual supplement (hidden events excluded from email)
  let upcomingHtml: string;
  const hiddenSet = new Set(data.hiddenEventIds || []);
  const visibleUpcoming = data.upcomingEvents.filter((e) => !hiddenSet.has(e.id));
  const hasCalendarEvents = visibleUpcoming.length > 0;
  const hasManual = upcomingManual.length > 0;
  if (!hasCalendarEvents && !hasManual) {
    upcomingHtml = `<span style="color:#94a3b8; font-style:italic; font-size:12px;">No upcoming events this week.</span>`;
  } else {
    const calPart = hasCalendarEvents
      ? `<ul style="margin:0 0 8px 0; padding-left:18px;">${visibleUpcoming
          .slice(0, 8)
          .map((e) => `<li style="margin:3px 0; font-size:12px; color:#e2e8f0;">${escapeHtml(e.title)}<span style="color:#94a3b8; font-size:11px;"> — ${formatEventDate(e.startISO)}${e.location ? ` @ ${escapeHtml(e.location)}` : ""}</span></li>`)
          .join("")}</ul>`
      : "";
    const manualPart = hasManual ? `<div style="font-size:12px; color:#e2e8f0; line-height:1.5; margin-top:6px;">${richTextToHtml(upcomingManual)}</div>` : "";
    upcomingHtml = calPart + manualPart;
  }

  // Email-safe, table-based Canva replica (Gmail+Outlook compatible) — thick white frame
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#D9780A;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#D9780A; margin:0; padding:16px 12px;">
    <tr>
      <td align="center" style="padding:0;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%; max-width:600px; margin:0 auto; background-color:#ffffff; border:10px solid #ffffff; border-radius:0; overflow:hidden;">
          <!-- Header: navy -->
          <tr>
            <td style="background-color:#0F1F3C; padding:18px 24px 14px 24px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="vertical-align:top;">
                    <div style="font-family:Arial,Helvetica,sans-serif; font-size:10px; letter-spacing:2px; color:#ffffff; opacity:0.9; text-transform:uppercase;">WEEK OF ${weekLabel.toUpperCase()}</div>
                    <div style="height:2px; background-color:#E88A1A; margin:6px 0 10px 0; width:100%;"></div>
                    <div style="font-family:'Arial Black',Arial,Helvetica,sans-serif; font-size:26px; font-weight:900; color:#ffffff; line-height:1.1; letter-spacing:0.5px; text-align:center; white-space:nowrap;">ON THE DOCKET THIS WEEK</div>
                  </td>
                  <td style="vertical-align:top; text-align:right; width:64px; padding-left:12px;">
                    <img src="${H_LOGO_DATA_URI}" alt="H" width="56" height="98" style="display:block; width:56px; height:auto; border:0;" />
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- GIF centered, ignoring columns, full width -->
          <tr>
            <td style="padding:8px 8px 4px 8px; background-color:#D9780A; text-align:center;">
              ${
                gifUrl
                  ? `<img src="${escapeHtml(gifUrl)}" alt="Weekly GIF" style="display:block; width:100%; max-width:420px; height:auto; max-height:200px; object-fit:contain; border:0; margin:0 auto; border-radius:12px;">`
                  : `<div style="background: linear-gradient(135deg,#87CEEB 0%,#E0F6FF 40%,#90EE90 100%); min-height:110px; padding:24px 12px; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#4a5568; text-align:center; border-radius:12px; max-width:420px; margin:0 auto;"><span>Your GIF will appear here<br><span style="font-size:10px; color:#718096;">Paste a GIF URL in the editor</span></span></div>`
              }
            </td>
          </tr>
          <!-- Intro centered and wide, navy blue -->
          <tr>
            <td style="padding:4px 8px 8px 8px; background-color:#D9780A; text-align:center;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px; margin:0 auto; background-color:#0F1F3C; border-radius:12px; border:3px solid #ffffff;">
                <tr>
                  <td style="padding:12px 14px;">
                    <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#ffffff; line-height:1.6; background-color:rgba(255,255,255,0.08); border-radius:8px; padding:10px 12px;">${hasIntro ? richTextToHtml(intro, { linkColor: "#ffffff" }) : `<span style="color:#94a3b8; font-style:italic;">Add your intro text for the week…</span>`}</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Body: two columns -->
          <tr>
            <td style="padding:0; background-color:#D9780A;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <!-- Left column (plum) -->
                  <td style="background-color:#2A1740; width:48%; vertical-align:top; padding:18px 18px 20px 18px;">

                    <div style="margin-bottom:16px;">
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; color:#ffffff; margin-bottom:6px; text-align:center;">📚 CURRICULUM ASKS 📚</div>
                      <div style="height:1.5px; background-color:#E88A1A; margin-bottom:8px;"></div>
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#e2e8f0; line-height:1.5; min-height:18px;">${hasCurriculum ? richTextToHtml(curriculum) : `<span style="color:#94a3b8; font-style:italic;">Add curriculum asks…</span>`}</div>
                    </div>

                    <div style="margin-bottom:16px;">
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; color:#ffffff; margin-bottom:6px; text-align:center;">💾 DATA ASKS 💾</div>
                      <div style="height:1.5px; background-color:#E88A1A; margin-bottom:8px;"></div>
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#e2e8f0; line-height:1.5; min-height:18px;">${hasDataAsks ? richTextToHtml(dataAsks) : `<span style="color:#94a3b8; font-style:italic;">Add data asks…</span>`}</div>
                    </div>

                    <div style="margin-bottom:16px;">
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; color:#ffffff; margin-bottom:6px; text-align:center;">🗓️ UPCOMING EVENTS 🗓️</div>
                      <div style="height:1.5px; background-color:#E88A1A; margin-bottom:8px;"></div>
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#e2e8f0; line-height:1.5;">${upcomingHtml}</div>
                    </div>

                    <div style="margin-bottom:4px;">
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; font-weight:700; color:#ffffff; margin-bottom:6px; text-align:center;">📌 IMPORTANT LINKS 📌</div>
                      <div style="height:1.5px; background-color:#E88A1A; margin-bottom:8px;"></div>
                      <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#e2e8f0; line-height:1.5; min-height:18px;">${hasImportantLinks ? richTextToHtml(importantLinks) : `<span style="color:#94a3b8; font-style:italic;">Add important links…</span>`}</div>
                    </div>
                  </td>

                  <!-- Right column -->
                  <td style="width:52%; vertical-align:top; padding:0; background-color:#D9780A;">
                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                      <!-- Side picture above priorities — scalable & positionable + caption -->
                      <tr>
                        <td style="padding:8px 8px 0 8px; background-color:#D9780A; text-align:center;">
                          ${
                            data.sideImageUrl
                              ? `<div style="border-radius:12px; border:3px solid #ffffff; overflow:hidden; height:180px; background-color:#ffffff;"><img src="${escapeHtml(data.sideImageUrl)}" alt="Right column image" style="display:block; width:100%; height:100%; object-fit:cover; object-position:${escapeHtml(data.sideImagePos || "50% 50%")}; transform:scale(${(data.sideImageScale || 100)/100}); transform-origin:${escapeHtml(data.sideImagePos || "50% 50%")};"></div>${sideImageCaption ? `<div style="font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#ffffff; text-align:center; padding:6px 8px 0 8px; line-height:1.4; font-style:italic;">${escapeHtml(sideImageCaption)}</div>` : ""}`
                              : `<div style="background-color:#ffffff; border-radius:12px; border:3px solid #ffffff; min-height:120px; display:flex; align-items:center; justify-content:center; font-family:Arial,Helvetica,sans-serif; font-size:11px; color:#6b7280; text-align:center; padding:12px;"><span>Picture for right column<br><span style="font-size:10px;">Paste image URL in editor</span></span></div>`
                          }
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:10px 10px 0 10px; background-color:#D9780A;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#FBBF24; border-radius:14px; border:3px solid #ffffff;">
                            <tr>
                              <td style="padding:12px 14px 14px 14px;">
                                <div style="font-family:'Arial Black',Arial,Helvetica,sans-serif; font-size:13px; font-weight:900; color:#0F1F3C; text-align:center; letter-spacing:0.3px; margin-bottom:8px;">🔥 PRIORITIES FOR THE WEEK 🔥</div>
                                <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#1e293b; line-height:1.5; background-color:rgba(255,255,255,0.45); border-radius:8px; padding:8px 10px;">${prioritiesHtml}</div>
                              </td>
                            </tr>
                            <!-- bubble pointer -->
                            <tr>
                              <td style="padding:0 0 0 28px; height:14px; line-height:0;">
                                <div style="width:0; height:0; border-left:14px solid transparent; border-right:14px solid transparent; border-top:14px solid #FBBF24; margin:0;"></div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                      <!-- Kudos Korner — below priorities -->
                      <tr>
                        <td style="padding:0 10px 10px 10px; background-color:#D9780A;">
                          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0F1F3C; border-radius:14px; border:3px solid #ffffff;">
                            <tr>
                              <td style="padding:12px 14px 14px 14px;">
                                <div style="font-family:'Arial Black',Arial,Helvetica,sans-serif; font-size:13px; font-weight:900; color:#FBBF24; text-align:center; letter-spacing:0.3px; margin-bottom:8px;">🏆 KUDOS KORNER 🏆</div>
                                <div style="font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#ffffff; line-height:1.5; background-color:rgba(255,255,255,0.08); border-radius:8px; padding:8px 10px;">${kudosOverride ? richTextToHtml(kudosOverride, { linkColor: "#ffffff" }) : `<span style="color:#94a3b8; font-style:italic;">Add a shout-out for your team…</span>`}</div>
                              </td>
                            </tr>
                            <!-- bubble pointer -->
                            <tr>
                              <td style="padding:0 0 0 28px; height:14px; line-height:0;">
                                <div style="width:0; height:0; border-left:14px solid transparent; border-right:14px solid transparent; border-top:14px solid #0F1F3C; margin:0;"></div>
                              </td>
                            </tr>
                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Wave footer (navy) -->
          <tr>
            <td style="background-color:#0F1F3C; height:24px; line-height:0; text-align:center; padding:0;">
              <div style="font-size:14px; color:#0F1F3C; letter-spacing:4px; line-height:24px;">〰〰〰〰〰〰〰〰〰〰〰〰〰〰〰</div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return html;
}

export function renderWeeklyText(data: CompiledWeeklyData, curriculumText: string, personalNote: string, gifUrl?: string): string {
  const intro = (data.introText ?? personalNote ?? "").trim() || curriculumText || "";
  const curriculum = (curriculumText ?? data.curriculumText ?? "").trim();
  const dataAsks = (data.dataAsks ?? "").trim();
  const importantLinks = (data.importantLinks ?? "").trim();
  const prioritiesOverride = (data.prioritiesText ?? "").trim();
  const upcomingManual = (data.upcomingManual ?? "").trim();

  const weekLabel = data.weekOf.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const weekEnd = endOfWeek(data.weekOf).toLocaleDateString("en-US", { month: "long", day: "numeric" });

  let txt = `THIS WEEK IN OUR POD — Week of ${weekLabel} to ${weekEnd}\n`;
  txt += `Sent to ${data.recipients.length} team member${data.recipients.length !== 1 ? "s" : ""}\n`;
  if (gifUrl || data.gifUrl) txt += `GIF: ${gifUrl || data.gifUrl}\n`;
  txt += "\n";

  if (intro) {
    txt += `${intro}\n\n`;
  }

  txt += "THIS MONTH'S FOCUS\n";
  txt += `  Curriculum Asks: ${curriculum || "(none)"}\n`;
  txt += `  Data Asks: ${dataAsks || "(none)"}\n`;
  txt += "  Upcoming Events:\n";
  const hiddenText = new Set(data.hiddenEventIds || []);
  const visibleText = data.upcomingEvents.filter((e) => !hiddenText.has(e.id));
  if (visibleText.length > 0) {
    for (const e of visibleText) {
      txt += `    • ${e.title} — ${formatEventDate(e.startISO)}${e.location ? ` @ ${e.location}` : ""}\n`;
    }
  }
  if (upcomingManual) txt += `    ${upcomingManual}\n`;
  if (visibleText.length === 0 && !upcomingManual) txt += "    (none)\n";
  txt += `  Important Links: ${importantLinks || "(none)"}\n\n`;

  txt += "PRIORITIES FOR THE WEEK!\n";
  if (prioritiesOverride) {
    txt += `${prioritiesOverride}\n`;
  } else if (data.priorities.length === 0) {
    txt += "  (none)\n";
  } else {
    for (const t of data.priorities) {
      txt += `  • ${t.name} — ${t.dueDate ? formatDateTime(t.dueDate.toISOString()) : "no due date"}\n`;
    }
  }
  txt += "\n";

  txt += "KUDOS KORNER\n";
  txt += data.kudosText ? `  ${data.kudosText}\n` : "  (none)\n\n";

  if (data.sideImageUrl) {
    txt += `Side image: ${data.sideImageUrl}\n`;
    if (data.sideImageCaption) txt += `  ${data.sideImageCaption}\n`;
    txt += "\n";
  }

  if (data.calendarName) txt += `Calendar: ${data.calendarName}\n`;

  return txt.trimEnd();
}
