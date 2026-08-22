import { NextResponse } from "next/server";
import { getConnectedAccount, disconnectGmail } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// GET /api/email-triage/google/status — connection state for the UI
export async function GET() {
  try {
    const auth = await getConnectedAccount();
    return NextResponse.json({ connected: Boolean(auth), email: auth?.email ?? null });
  } catch {
    return NextResponse.json({ connected: false, email: null });
  }
}

// DELETE /api/email-triage/google/status — disconnect the mailbox
export async function DELETE() {
  await disconnectGmail();
  return NextResponse.json({ connected: false });
}
