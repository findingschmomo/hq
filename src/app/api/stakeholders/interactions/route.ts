import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// POST /api/stakeholders/interactions — log a touchpoint
export async function POST(req: Request) {
  const body = await req.json();
  if (!body.stakeholderId || !body.summary?.trim()) {
    return NextResponse.json({ error: "stakeholderId and summary required" }, { status: 400 });
  }

  const interaction = await prisma.stakeholderInteraction.create({
    data: {
      stakeholderId: body.stakeholderId,
      channel: body.channel || "email",
      direction: body.direction || "outbound",
      summary: body.summary.trim(),
      date: body.date ? new Date(body.date) : new Date(),
      followUpNeeded: Boolean(body.followUpNeeded),
      followUpDate: body.followUpDate ? new Date(body.followUpDate) : null,
      sentiment: body.sentiment || null,
    },
  });

  // touching someone resets their contact clock
  await prisma.stakeholder.update({
    where: { id: body.stakeholderId },
    data: { lastContactAt: interaction.date },
  });

  return NextResponse.json(interaction);
}

// PATCH /api/stakeholders/interactions — e.g. mark a follow-up done
export async function PATCH(req: Request) {
  const { id, ...updates } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const data: Record<string, unknown> = {};
  for (const key of ["channel", "direction", "summary", "sentiment"]) {
    if (key in updates) data[key] = updates[key];
  }
  if ("followUpDone" in updates) data.followUpDone = Boolean(updates.followUpDone);
  if ("date" in updates && updates.date) data.date = new Date(updates.date);
  if ("followUpDate" in updates) data.followUpDate = updates.followUpDate ? new Date(updates.followUpDate) : null;

  try {
    const interaction = await prisma.stakeholderInteraction.update({ where: { id }, data });
    return NextResponse.json(interaction);
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}

// GET /api/stakeholders/interactions?followUps=true — open follow-ups across everyone
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const followUps = searchParams.get("followUps");

  if (followUps === "true") {
    const items = await prisma.stakeholderInteraction.findMany({
      where: { followUpNeeded: true, followUpDone: false },
      orderBy: [{ followUpDate: "asc" }, { date: "desc" }],
      include: { stakeholder: { select: { id: true, name: true, organization: true, type: true } } },
      take: 100,
    });
    return NextResponse.json({ interactions: items });
  }

  const interactions = await prisma.stakeholderInteraction.findMany({
    orderBy: { date: "desc" },
    include: { stakeholder: { select: { id: true, name: true, organization: true, type: true } } },
    take: 100,
  });
  return NextResponse.json({ interactions });
}
