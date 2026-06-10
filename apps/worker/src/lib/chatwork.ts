const CHATWORK_API_BASE = 'https://api.chatwork.com/v2';

export async function sendChatworkMessage(
  apiToken: string,
  roomId: string,
  message: string,
): Promise<void> {
  try {
    const res = await fetch(`${CHATWORK_API_BASE}/rooms/${roomId}/messages`, {
      method: 'POST',
      headers: {
        'X-ChatWorkToken': apiToken,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ body: message }),
    });
    if (!res.ok) {
      console.error(`Chatwork API error: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error('sendChatworkMessage failed:', err);
  }
}

export function jstTimestamp(): string {
  return new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
}
