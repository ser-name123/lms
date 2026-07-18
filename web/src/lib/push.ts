"use client";

/*
 * Browser push opt-in.
 *
 * Permission is only ever requested from a user gesture (the toggle in the
 * notification settings) — never on page load. An unprompted permission dialog
 * is the fastest way to get permanently denied by the browser, and a denial
 * cannot be undone from JavaScript.
 */

import { fetchPushPublicKey, subscribePush, unsubscribePush } from "@/lib/api";

export type PushState = "unsupported" | "denied" | "granted" | "default";

export function pushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

export function pushPermission(): PushState {
  if (!pushSupported()) return "unsupported";
  return Notification.permission as PushState;
}

/** VAPID keys travel as base64url; PushManager wants raw bytes. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalised = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(normalised);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/sw.js");
  if (existing) return existing;
  return navigator.serviceWorker.register("/sw.js");
}

/**
 * Registers this browser for push. Returns a human-readable reason when it
 * cannot, so the caller can tell the user what happened rather than failing
 * silently.
 */
export async function enablePush(): Promise<{ ok: boolean; reason?: string }> {
  if (!pushSupported()) {
    return { ok: false, reason: "This browser does not support push notifications." };
  }

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return {
      ok: false,
      reason:
        permission === "denied"
          ? "Notifications are blocked for this site. Allow them in your browser settings to turn this on."
          : "Permission was dismissed.",
    };
  }

  const { publicKey, enabled } = await fetchPushPublicKey();
  if (!enabled || !publicKey) {
    return { ok: false, reason: "Push is not configured on the server yet." };
  }

  const reg = await registration();
  await navigator.serviceWorker.ready;

  // Reuse the existing subscription if there is one — resubscribing produces a
  // new endpoint and orphans the old row on the server.
  const existing = await reg.pushManager.getSubscription();
  const sub =
    existing ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    }));

  const json = sub.toJSON();
  if (!json.keys?.p256dh || !json.keys?.auth) {
    return { ok: false, reason: "The browser returned an incomplete subscription." };
  }

  await subscribePush({
    endpoint: sub.endpoint,
    p256dh: json.keys.p256dh,
    auth: json.keys.auth,
    userAgent: navigator.userAgent,
  });

  return { ok: true };
}

/** Unsubscribes this browser and forgets it server-side. */
export async function disablePush(): Promise<{ ok: boolean }> {
  if (!pushSupported()) return { ok: true };

  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return { ok: true };

  // Tell the server first: if unsubscribe() succeeds and the call then fails,
  // the server keeps pushing to a dead endpoint until it 410s.
  await unsubscribePush(sub.endpoint).catch(() => undefined);
  await sub.unsubscribe().catch(() => undefined);
  return { ok: true };
}

/** Whether *this* browser currently holds a subscription. */
export async function pushSubscribedHere(): Promise<boolean> {
  if (!pushSupported() || Notification.permission !== "granted") return false;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  const sub = await reg?.pushManager.getSubscription();
  return Boolean(sub);
}
