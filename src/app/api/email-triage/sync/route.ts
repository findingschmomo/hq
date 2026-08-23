import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConnectedAccount, listRecentInbox } from "@/lib/gmail";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/email-triage/sync — pull recent Gmail into the triage board.
// Existing messages (matched by gmailId) are left untouched.
export async function POST() {
  const auth = await getConnectedAccount();
  if (!auth) {
    return NextResponse.json({ error: "Gmail not connected", needsConnect: true }, { status: 400 });
  }

  try {
    const messages = await listRecentInbox(500);
    let added = 0;
    let skipped = 0;

    for (const m of messages) {
      const existing = await prisma.emailItem.findUnique({ where: { gmailId: m.gmailId } });
      if (existing) {
        skipped++;
        continue;
      }
      // skip mail you sent yourself
      if (m.fromEmail && auth.email && m.fromEmail.toLowerCase() === auth.email.toLowerCase()) {
        skipped++;
        continue;
      }
      await prisma.emailItem.create({
        data: {
          subject: m.subject,
          senderName: m.fromName,
          senderEmail: m.fromEmail,
          category: "general",
          priority: "medium",
          status: "triage",
          summary: m.body ?? m.snippet,
          receivedAt: m.date,
          gmailId: m.gmailId,
          threadId: m.threadId,
        },
      });
      added++;
    }

    return NextResponse.json({ ok: true, scanned: messages.length, added, skipped });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "sync failed" },
      { status: 500 },
    );
  }
}
