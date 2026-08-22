import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getConnectedAccount, getThreadMessageId, sendMail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// POST /api/email-triage/send — reply to a triaged email via Gmail.
// The user clicking Send IS the approval (human-in-the-loop by design).
export async function POST(req: Request) {
  const body = await req.json();
  const { emailId, to, subject, text } = body as {
    emailId?: string;
    to?: string;
    subject?: string;
    text?: string;
  };

  if (!to || !subject || !text?.trim()) {
    return NextResponse.json({ error: "to, subject and text are required" }, { status: 400 });
  }

  const auth = await getConnectedAccount();
  if (!auth) {
    return NextResponse.json({ error: "Gmail not connected", needsConnect: true }, { status: 400 });
  }

  try {
    // pull the thread so the reply lands in the same Gmail conversation
    let threadId: string | null = null;
    if (emailId) {
      const item = await prisma.emailItem.findUnique({ where: { id: emailId } });
      threadId = item?.threadId ?? null;
    }
    const inReplyTo = threadId ? await getThreadMessageId(threadId).catch(() => null) : null;

    const result = await sendMail({ to, subject, body: text, threadId, inReplyTo });

    // record the reply on the item
    if (emailId) {
      const stamp = new Date().toLocaleString("en-US", { month: "short", day: "numeric" });
      await prisma.emailItem
        .update({
          where: { id: emailId },
          data: {
            notes: `Replied ${stamp}: ${text.slice(0, 200)}${text.length > 200 ? "…" : ""}`,
            status: "waiting",
          },
        })
        .catch(() => {});
    }

    return NextResponse.json({ ok: true, messageId: result.messageId, threadId: result.threadId });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "send failed" },
      { status: 500 },
    );
  }
}
