import { getConnectedAccount, getGoogleAccessToken } from "./gmail";

const CAL_API = "https://www.googleapis.com/calendar/v3";

export interface CalEvent {
  id: string;
  title: string;
  startISO: string;
  endISO: string;
  allDay: boolean;
  location: string | null;
  meetLink: string | null;
  description: string | null;
  organizerEmail: string | null;
  attendeeEmails: string[];
}

interface GEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  hangoutLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  organizer?: { email?: string };
  attendees?: { email?: string }[];
}

export class CalendarNotReadyError extends Error {
  needsReconnect: boolean;
  reason: string;
  constructor(message: string, needsReconnect: boolean, reason = "") {
    super(message);
    this.needsReconnect = needsReconnect;
    this.reason = reason;
  }
}

async function calFetch(path: string): Promise<Response> {
  const token = await getGoogleAccessToken();
  return fetch(`${CAL_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

/** Events on the primary calendar between two ISO timestamps. */
export async function listEvents(timeMinISO: string, timeMaxISO: string): Promise<CalEvent[]> {
  if (!(await getConnectedAccount())) {
    throw new CalendarNotReadyError("Google not connected", true);
  }
  const params = new URLSearchParams({
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
  });
  const res = await calFetch(`/calendars/primary/events?${params}`);
  if (res.status === 401 || res.status === 403) {
    // Distinguish "API not enabled in Cloud project" from "scope not granted"
    let reason = "";
    try {
      const body = (await res.json()) as { error?: { errors?: { reason?: string }[]; status?: string } };
      reason = body?.error?.errors?.[0]?.reason ?? body?.error?.status ?? "";
    } catch { /* keep empty */ }
    const needsEnable = ["accessNotConfigured", "apiDisabled", "disabled", "serviceLimiting"].includes(reason);
    throw new CalendarNotReadyError(
      needsEnable
        ? "The Google Calendar API is not enabled for this Cloud project yet"
        : `Calendar permission missing — reconnect to grant access (${reason || res.status})`,
      !needsEnable,
      reason,
    );
  }
  if (!res.ok) throw new Error(`Calendar API failed (${res.status})`);

  const data = (await res.json()) as { items?: GEvent[] };
  return (data.items ?? []).map((e) => {
    const allDay = Boolean(e.start?.date && !e.start?.dateTime);
    const startISO = e.start?.dateTime ?? `${e.start?.date}T00:00:00`;
    const endISO = e.end?.dateTime ?? `${e.end?.date}T23:59:59`;
    const attendeeEmails = (e.attendees ?? [])
      .map((a) => (a.email ?? "").trim().toLowerCase())
      .filter((x) => x.includes("@"));
    const organizer = (e.organizer?.email ?? "").trim().toLowerCase();
    if (organizer.includes("@")) attendeeEmails.unshift(organizer);
    return {
      id: e.id,
      title: e.summary || "(no title)",
      startISO,
      endISO,
      allDay,
      location: e.location ?? null,
      meetLink: e.hangoutLink ?? null,
      description: e.description ?? null,
      organizerEmail: organizer || null,
      attendeeEmails: [...new Set(attendeeEmails)],
    };
  });
}
