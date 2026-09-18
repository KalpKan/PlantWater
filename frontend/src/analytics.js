// PostHog per docs/analytics.md in the hub repo: first-party /ingest proxy
// (vercel.json), cookieless (memory persistence), autocapture on, inputs
// masked in replays. With no REACT_APP_POSTHOG_KEY this is a silent no-op.
let posthog = null;
let booted = false;

export function initAnalytics() {
  const key = process.env.REACT_APP_POSTHOG_KEY;
  if (booted || !key || typeof window === 'undefined') return;
  booted = true;
  const boot = () => {
    import('posthog-js').then((mod) => {
      posthog = mod.default;
      posthog.init(key, {
        api_host: process.env.REACT_APP_POSTHOG_HOST || '/ingest',
        ui_host: 'https://us.posthog.com',
        persistence: 'memory',
        autocapture: true,
        capture_pageview: true,
        capture_pageleave: true,
        session_recording: { maskAllInputs: true },
        disable_surveys: true,
      });
    });
  };
  if (document.readyState === 'complete') boot();
  else window.addEventListener('load', boot, { once: true });
}

/** Custom events: plant_photo_uploaded, plant_identified, water_now_clicked. Sent instantly over sendBeacon. */
export function track(event, props) {
  if (!posthog) return;
  posthog.capture(event, props, { send_instantly: true, transport: 'sendBeacon' });
}
