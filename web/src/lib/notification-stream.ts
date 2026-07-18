"use client";

/*
 * Real-time notification stream.
 *
 * The browser's own EventSource cannot send an Authorization header, and this
 * API authenticates with a bearer token — putting the token in the query string
 * would leak it into access logs, proxy logs and browser history. So the stream
 * is read with fetch + a ReadableStream reader, which parses the same SSE wire
 * format but lets us set headers properly.
 *
 * The stream is an optimisation, never the source of truth: the server bus is
 * in-process, so a second API instance would not see another instance's events.
 * Callers keep their slow poll running and treat a stream event purely as
 * "refresh now".
 */

import { useEffect, useRef } from "react";
import { authSnapshot } from "@/store/auth";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:5000/api";

export type StreamHandler = (kind: string, payload: unknown) => void;

/** Parses one SSE frame ("event: x\ndata: y") into a handler call. */
function handleFrame(frame: string, onEvent: StreamHandler) {
  let kind = "message";
  const data: string[] = [];
  for (const line of frame.split("\n")) {
    if (line.startsWith(":")) continue; // comment / keep-alive
    if (line.startsWith("event:")) kind = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).trim());
  }
  if (!data.length) return;
  try {
    onEvent(kind, JSON.parse(data.join("\n")));
  } catch {
    // A malformed frame must not tear the connection down.
  }
}

/**
 * Subscribes to this user's notification stream for as long as the component
 * is mounted. `onEvent` is kept in a ref so a re-render never restarts the
 * connection — reconnecting on every parent render would be worse than polling.
 */
export function useNotificationStream(onEvent: StreamHandler, enabled = true) {
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;

    let closed = false;
    let controller: AbortController | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    const connect = async () => {
      if (closed) return;
      const token = authSnapshot()?.accessToken;
      if (!token) return; // signed out — nothing to listen to

      controller = new AbortController();
      try {
        const res = await fetch(`${BASE}/notifications/stream`, {
          headers: { Authorization: `Bearer ${token}`, Accept: "text/event-stream" },
          signal: controller.signal,
          cache: "no-store",
        });
        if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);

        attempt = 0; // a successful connect resets the backoff
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done, value } = await reader.read();
          if (done || closed) break;
          buffer += decoder.decode(value, { stream: true });

          // Frames are separated by a blank line.
          let split = buffer.indexOf("\n\n");
          while (split !== -1) {
            const frame = buffer.slice(0, split);
            buffer = buffer.slice(split + 2);
            handleFrame(frame, (k, p) => handlerRef.current(k, p));
            split = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Network blip, token refresh, server restart — all handled the same.
      }

      if (closed) return;
      // Exponential backoff capped at 30s so a downed API is not hammered.
      attempt++;
      const delay = Math.min(1000 * 2 ** Math.min(attempt, 5), 30_000);
      retryTimer = setTimeout(connect, delay);
    };

    void connect();

    // A backgrounded tab that comes back should not wait out the backoff.
    const onVisible = () => {
      if (document.visibilityState === "visible" && retryTimer) {
        clearTimeout(retryTimer);
        retryTimer = null;
        attempt = 0;
        void connect();
      }
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      closed = true;
      document.removeEventListener("visibilitychange", onVisible);
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
    };
  }, [enabled]);
}
