import type { Env } from '../index.js';

export const STORE_CALENDAR_IDS: Record<string, string> = {
  gotanda: '516027835929764fc6d566296c76523e9e7060330419c2581bace550e5a3f735@group.calendar.google.com',
  kinshicho: '6f0fc164cf302a99a13eb366f28e4f277e43d09c151bad7f381aea2c1819368c@group.calendar.google.com',
  morioka: '7fc7ks6v4sl97cfhk3ltpo027s@group.calendar.google.com',
  utsunomiya: 'd.utsunomiya0910@gmail.com',
  narita: '8b887586015ab68f887344e04deb8873f13a9923a7d413d5100f8781268e908a@group.calendar.google.com',
  shobu: '69c3rqjrot4n4qt1t57ih36e2c@group.calendar.google.com',
  makuhari: 'f546b166234811e0f10f12f380388583e092d1eaf5e88cc321f6f09bae1505f4@group.calendar.google.com',
  aomori: 'daiwan.sun.aomori@gmail.com',
  oita: '1c6dd28d46d8f4db9ed9899080770e6aa3ab1538eda6d280814518dc574bb7c9@group.calendar.google.com',
  gifu: 'daiwangifu2024@gmail.com',
  nagaoka: '7c091a61efb554fe43f6c253400cc2f45632be73848a3165b7d722d157ad7c93@group.calendar.google.com',
  kizugawa: 'daiwankizugawa@gmail.com',
};

async function getAccessToken(env: Env['Bindings']): Promise<string> {
  console.log('[Google Calendar] Refreshing access token...');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: env.GOOGLE_CLIENT_ID ?? '',
      client_secret: env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: env.GOOGLE_REFRESH_TOKEN ?? '',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`[Google Calendar] Token refresh failed: ${res.status} ${body}`);
    throw new Error(`Token refresh failed: ${res.status} ${body}`);
  }
  const data = await res.json() as { access_token: string };
  console.log('[Google Calendar] Access token obtained successfully');
  return data.access_token;
}

export async function createCalendarEvent(
  env: Env['Bindings'],
  calendarId: string,
  event: {
    title: string;
    startDateTime: string;
    endDateTime: string;
    description: string;
  },
): Promise<string | null> {
  console.log(`[Google Calendar] Creating event on calendar: ${calendarId}`);
  console.log(`[Google Calendar] Event: ${event.title} | ${event.startDateTime} ~ ${event.endDateTime}`);
  try {
    const accessToken = await getAccessToken(env);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        summary: event.title,
        description: event.description,
        start: { dateTime: event.startDateTime, timeZone: 'Asia/Tokyo' },
        end: { dateTime: event.endDateTime, timeZone: 'Asia/Tokyo' },
      }),
    });
    const responseText = await res.text();
    if (!res.ok) {
      console.error(`[Google Calendar] API error ${res.status}: ${responseText}`);
      return null;
    }
    const data = JSON.parse(responseText) as { id: string };
    console.log(`[Google Calendar] Event created successfully: ${data.id}`);
    return data.id;
  } catch (err) {
    console.error('[Google Calendar] createCalendarEvent error:', err);
    return null;
  }
}
