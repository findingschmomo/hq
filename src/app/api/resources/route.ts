import { NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");
  const forScope = searchParams.get("forScope");
  const featured = searchParams.get("featured");
  const where: Record<string, unknown> = {};
  if (category) where.category = category;
  if (forScope) where.forScope = forScope;
  if (featured === "true") where.featured = true;
  try {
    const resources = await prisma.resource.findMany({
      where,
      orderBy: [{ pinned: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ resources });
  } catch (err) {
    console.error("resources GET error:", err);
    return NextResponse.json({ error: "Failed to fetch resources" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const session = await getToken({ req: req as never, secret: process.env.NEXTAUTH_SECRET });
  const hasSecret = req.headers.get("x-internal-secret") === process.env.INTERNAL_API_SECRET;
  if (!session && !hasSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = await req.json();
    const { title, url, category, tags, forScope, podId, schoolId, featured, pinned } = body;
    if (!title || !url) return NextResponse.json({ error: "Missing title or url" }, { status: 400 });
    const created = await prisma.resource.create({
      data: {
        title,
        url,
        category: category || "general",
        tags: Array.isArray(tags) ? tags : [],
        forScope: forScope || "all",
        podId: podId || null,
        schoolId: schoolId || null,
        featured: Boolean(featured),
        pinned: Boolean(pinned),
      },
    });
    return NextResponse.json(created);
  } catch (err) {
    console.error("resources POST error:", err);
    return NextResponse.json({ error: "Failed to create resource" }, { status: 500 });
  }
}
