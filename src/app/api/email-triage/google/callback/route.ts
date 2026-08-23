import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearGoogleTokenCache } from "@/lib/gmail";

export const dynamic = "force-dynamic";

// GET /api/email-triage/google/callback?code=...&state=...
// Exchanges the authorization code for a refresh token and stores it.
async function handle(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const cookies = req.headers.get("cookie") ?? "";
  // where should the user land afterwards? (set by /connect?returnTo=…)
  const returnRaw = cookies.match(/google-return=([^;]+)/)?.[1];
  const returnTo = returnRaw && decodeURIComponent(returnRaw).startsWith("/") ? decodeURIComponent(returnRaw) : "/email-triage";

  const fail = (reason: string) => {
    const res = NextResponse.redirect(new URL(`${returnTo}?google=${encodeURIComponent(reason)}`, url.origin));
    res.cookies.delete("google-return");
    return res;
  };

  if (error) return fail(`denied:${error}`);
  if (!code) return fail("missing_code");
  if (!state || state !== cookies.match(/gmail-oauth-state=([^;]+)/)?.[1]) {
    return fail("bad_state");
  }

  try {
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? "",
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
        redirect_uri: `${url.origin}/api/email-triage/google/callback`,
        grant_type: "authorization_code",
      }),
    });
    if (!tokenRes.ok) {
      return fail(`token_error_${tokenRes.status}`);
    }
    const tokens = (await tokenRes.json()) as { refresh_token?: string; access_token?: string };
    if (!tokens.refresh_token) return fail("no_refresh_token");

    // identify the account with the (short-lived) access token
    let email = "";
    if (tokens.access_token) {
      const infoRes = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (infoRes.ok) {
        const profile = (await infoRes.json()) as { emailAddress?: string };
        email = profile.emailAddress ?? "";
      }
    }

    await prisma.dataStore.upsert({
      where: { key: "gmail-oauth" },
      update: { data: { refreshToken: tokens.refresh_token, email } },
      create: { key: "gmail-oauth", data: { refreshToken: tokens.refresh_token, email } },
    });

    // new consent may carry new scopes — drop any cached access token
    clearGoogleTokenCache();

    const res = NextResponse.redirect(new URL(`${returnTo}?google=connected`, url.origin));
    res.cookies.delete("google-return");
    return res;
  } catch {
    return fail("unexpected_error");
  }
}

export const GET = handle;
