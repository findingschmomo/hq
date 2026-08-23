import { NextResponse } from "next/server";
import { randomUUID } from "crypto";

export const dynamic = "force-dynamic";

// GET /api/email-triage/google/connect
// Kicks off the Google OAuth consent flow for Gmail + Calendar scopes.
// Requires: Gmail API AND Google Calendar API enabled, these scopes on the
// OAuth consent screen, and <origin>/api/email-triage/google/callback
// registered as an authorized redirect URI on the same OAuth client.
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: "GOOGLE_CLIENT_ID is not configured" }, { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const state = randomUUID();
  // optional ?returnTo=/calendar so the callback drops the user back where
  // they started; only allow in-app paths.
  const returnToParam = new URL(req.url).searchParams.get("returnTo") ?? "";
  const returnTo = returnToParam.startsWith("/") ? returnToParam : "/email-triage";

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", `${origin}/api/email-triage/google/callback`);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", SCOPES);
  authUrl.searchParams.set("access_type", "offline"); // need a refresh token
  authUrl.searchParams.set("prompt", "consent"); // force refresh token every time
  authUrl.searchParams.set("state", state);

  const res = NextResponse.redirect(authUrl.toString());
  res.cookies.set("gmail-oauth-state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  res.cookies.set("google-return", encodeURIComponent(returnTo), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
    sameSite: "lax",
  });
  return res;
}
