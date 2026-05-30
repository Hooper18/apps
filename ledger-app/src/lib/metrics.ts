const URL = import.meta.env.VITE_METRICS_URL as string | undefined;
const KEY = import.meta.env.VITE_METRICS_ANON_KEY as string | undefined;
const BOT_RE = /bot|spider|crawl|headless|lighthouse|pagespeed|facebookexternalhit|preview/i;

export function logVisit(app: 'main' | 'ledger' | 'billiards' | 'schedule' | 'tuner') {
  if (!URL || !KEY) return;
  const ua = navigator.userAgent || '';
  const isBot = (navigator as any).webdriver === true || BOT_RE.test(ua);
  fetch(`${URL}/rest/v1/visit_events`, {
    method: 'POST',
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({ app, is_bot: isBot, ua: ua.slice(0, 256) }),
  }).catch(() => {});
}
