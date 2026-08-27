import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const pods = await prisma.pod.findMany({
      include: {
        director: { select: { id: true, name: true, email: true, title: true } },
        schools: {
          select: {
            id: true,
            name: true,
            schoolProfile: true,
            members: { select: { id: true, name: true, email: true, title: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ pods });
  } catch (err) {
    console.error("pods GET error:", err);
    return NextResponse.json({ error: "Failed to fetch pods" }, { status: 500 });
  }
}
