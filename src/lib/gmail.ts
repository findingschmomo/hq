import { prisma } from "@/lib/prisma";

/* ───────────────────────────────────────────────────────────
   Minimal Gmail REST client — no SDK dependency.
   Auth: OAuth2 refresh token (stored in DataStore after the
   /api/email-triage/google/connect consent flow).
   Scopes used: gmail.readonly gmail.send
   ─────────────────────────────────────────────────────────── */

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me";

type StoredAuth = { refreshToken: string; email: string };
type TokenCache = { accessToken: string; expiresAt: number };

let cachedToken: TokenCache | null = null;

export async function getConnectedAccount(): Promise<StoredAuth | null> {
  const row = await prisma.dataStore.findUnique({ where: { key: "gmail-oauth" } });
  if (!row) return null;
  const data = row.data as unknown as StoredAuth;
  if (!data?.refreshToken) return null;
  return data;
}

export async function disconnectGmail(): Promise<void> {
  await prisma.dataStore.delete({ where: { key: "gmail-oauth" } }).catch(() => {});
  cachedToken = null;
}

async function getAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.accessToken;
  }
  const auth = await getConnectedAccount();
  if (!auth) throw new Error("Gmail not connected");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      refresh_token: auth.refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Google token refresh failed (${res.status}): ${detail.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

async function gmailFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  return fetch(`${GMAIL_API}${path}`, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
}

// ── Read ───────────────────────────────────────────────────

export interface GmailSummary {
  gmailId: string;
  threadId: string;
  subject: string;
  fromName: string | null;
  fromEmail: string | null;
  date: Date;
  snippet: string;
  body: string | null;
}

/** Inbox mail from the last 30 days, paginated (Gmail caps pages at 500). */
export async function listRecentInbox(max = 500): Promise<GmailSummary[]> {
  const q = encodeURIComponent("label:inbox newer_than:30d");
  const ids: string[] = [];
  let pageToken: string | undefined;
  do {
    const params = new URLSearchParams({ q: decodeURIComponent(q), maxResults: String(Math.min(max - ids.length, 500)) });
    if (pageToken) params.set("pageToken", pageToken);
    const listRes = await gmailFetch(`/messages?${params}`);
    if (!listRes.ok) throw new Error(`Gmail list failed (${listRes.status})`);
    const list = (await listRes.json()) as { messages?: { id: string }[]; nextPageToken?: string };
    ids.push(...(list.messages ?? []).map((m) => m.id));
    pageToken = list.nextPageToken;
  } while (pageToken && ids.length < max);

  const out: GmailSummary[] = [];
  for (const id of ids) {
    try {
      out.push(await getMessage(id));
    } catch {
      // skip individual failures; one bad message shouldn't kill a sync
    }
  }
  return out;
}

export async function getMessage(id: string): Promise<GmailSummary> {
  const res = await gmailFetch(`/messages/${id}?format=full`);
  if (!res.ok) throw new Error(`Gmail get failed (${res.status})`);
  const msg = await res.json();

  const headers = (msg.payload?.headers ?? []) as { name: string; value: string }[];
  const header = (name: string) => headers.find((h) => h.name.toLowerCase() === name)?.value ?? "";

  const { name, email } = parseFrom(header("from"));
  let body: string | null = null;
  try {
    body = extractBody(msg.payload);
  } catch {
    body = null;
  }

  return {
    gmailId: msg.id,
    threadId: msg.threadId,
    subject: header("subject") || "(no subject)",
    fromName: name,
    fromEmail: email,
    date: header("date") ? new Date(header("date")) : new Date(Number(msg.internalDate ?? Date.now())),
    snippet: msg.snippet ?? "",
    body,
  };
}

function parseFrom(raw: string): { name: string | null; email: string | null } {
  if (!raw) return { name: null, email: null };
  const angle = raw.match(/^(.*)<([^>]+)>$/);
  if (angle) {
    const name = angle[1].trim().replace(/^"|"$/g, "");
    return { name: name || null, email: angle[2].trim() };
  }
  return { name: null, email: raw.trim() };
}

interface MimePart {
  mimeType?: string;
  body?: { data?: string };
  parts?: MimePart[];
}

// Best-effort plain-text extraction from the MIME payload tree.
function extractBody(payload: MimePart | null): string | null {
  if (!payload) return null;
  const collect = (part: MimePart): string | null => {
    const mime = part.mimeType ?? "";
    if ((mime === "text/plain" || mime === "text/html") && part.body?.data) {
      const text = Buffer.from(part.body.data, "base64url").toString("utf-8");
      return mime === "text/html" ? htmlToText(text) : text;
    }
    for (const child of part.parts ?? []) {
      const found = collect(child);
      if (found) return found;
    }
    return null;
  };

  const direct = collect(payload);
  if (direct) return direct;

  // whole-message fallback (e.g. simple non-multipart messages)
  if (payload.body?.data) {
    const text = Buffer.from(payload.body.data, "base64url").toString("utf-8");
    return payload.mimeType === "text/html" ? htmlToText(text) : text;
  }
  return null;
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, 4000);
}

// ── Send ───────────────────────────────────────────────────

/** RFC 4122 Message-ID of the first message in a thread (for In-Reply-To). */
export async function getThreadMessageId(threadId: string): Promise<string | null> {
  const res = await gmailFetch(
    `/threads/${threadId}?format=metadata&metadataHeaders=Message-ID`,
  ).catch(() => null);
  if (!res || !res.ok) return null;
  const thread = await res.json();
  const first = (thread.messages ?? [])[0];
  const header = (first?.payload?.headers ?? []).find(
    (h: { name: string }) => h.name.toLowerCase() === "message-id",
  );
  return header?.value ?? null;
}

export interface SendArgs {
  to: string;
  subject: string;
  body: string;
  /** Gmail thread id — keeps the reply in the original thread. */
  threadId?: string | null;
  /** Original Message-ID header, for proper In-Reply-To/References. */
  inReplyTo?: string | null;
}

export async function sendMail({ to, subject, body, threadId, inReplyTo }: SendArgs): Promise<{ messageId: string; threadId: string | null }> {
  const headers = [
    `To: ${to}`,
    `Subject: ${subject.includes("Re:") ? subject : `Re: ${subject}`}`,
    "Content-Type: text/plain; charset=UTF-8",
  ];
  if (inReplyTo) {
    headers.push(`In-Reply-To: ${inReplyTo}`);
    headers.push(`References: ${inReplyTo}`);
  }
  const mime = `${headers.join("\r\n")}\r\n\r\n${body}`;
  const raw = Buffer.from(mime).toString("base64url");

  const res = await gmailFetch("/messages/send", {
    method: "POST",
    body: JSON.stringify({ raw, ...(threadId ? { threadId } : {}) }),
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${detail.slice(0, 300)}`);
  }
  const json = (await res.json()) as { id: string; threadId: string };
  return { messageId: json.id, threadId: json.threadId ?? null };
}
