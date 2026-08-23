import { prisma } from "@/lib/prisma";
import type { CalEvent } from "./gcal";

/** Addresses owned by the ED — meetings with herself are not touchpoints. */
async function getSelfEmails(): Promise<Set<string>> {
  const row = await prisma.dataStore.findUnique({ where: { key: "gmail-oauth" } });
  const connected = (row?.data as unknown as { email?: string } | null)?.email?.trim().toLowerCase();
  return new Set(connected ? ["henriettaobsidian@gmail.com", connected] : ["henriettaobsidian@gmail.com"]);
}

/**
 * Matches calendar events against stakeholder emails and logs a "meeting"
 * interaction per attendee found. Idempotent: an event logs once per
 * stakeholder (deduped on stakeholder + time + title).
 */
export async function logMeetingTouchpoints(events: CalEvent[]): Promise<number> {
  const candidates = events.filter((e) => e.attendeeEmails.length > 0);
  if (candidates.length === 0) return 0;

  const self = await getSelfEmails();
  const emails = [...new Set(candidates.flatMap((e) => e.attendeeEmails))].filter((x) => !self.has(x));
  if (emails.length === 0) return 0;

  const stakeholders = await prisma.stakeholder.findMany({
    where: { archived: false, email: { in: emails, mode: "insensitive" } },
    select: { id: true, email: true, lastContactAt: true },
  });
  if (stakeholders.length === 0) return 0;
  const byEmail = new Map(stakeholders.map((s) => [(s.email ?? "").toLowerCase(), s]));

  let logged = 0;
  for (const event of candidates) {
    const when = new Date(event.startISO);
    if (isNaN(when.getTime())) continue;
    const summary = `Meeting: ${event.title}`.slice(0, 200);

    for (const addr of event.attendeeEmails) {
      const stakeholder = byEmail.get(addr);
      if (!stakeholder) continue;

      const dupe = await prisma.stakeholderInteraction.findFirst({
        where: { stakeholderId: stakeholder.id, channel: "meeting", date: when, summary },
      });
      if (dupe) continue;

      await prisma.stakeholderInteraction.create({
        data: { stakeholderId: stakeholder.id, channel: "meeting", direction: "outbound", summary, date: when },
      });
      logged++;

      if (!stakeholder.lastContactAt || when > stakeholder.lastContactAt) {
        await prisma.stakeholder.update({ where: { id: stakeholder.id }, data: { lastContactAt: when } });
        stakeholder.lastContactAt = when;
      }
    }
  }
  return logged;
}
