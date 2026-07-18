import { Injectable, Logger } from '@nestjs/common';
import { Observable, Subject, filter, map, merge, timer } from 'rxjs';

/*
 * Real-time delivery over Server-Sent Events.
 *
 * SSE rather than WebSockets: it is one-directional (server → browser), which
 * is exactly what a notification feed needs, it survives proxies that mangle
 * upgrades, the browser reconnects on its own, and NestJS supports it natively
 * with no new dependency.
 *
 * The bus is IN-PROCESS. With more than one API instance, a user connected to
 * instance A will not receive an event emitted on instance B — they fall back
 * to the 60s poll the client still runs as a safety net. Going multi-instance
 * means putting Redis pub/sub behind `publish`. The same single-process caveat
 * already applies to the nine setInterval sweeps elsewhere in this codebase.
 */

export interface StreamEvent {
  userId: string;
  kind: 'notification' | 'read' | 'read-all';
  payload: unknown;
}

@Injectable()
export class NotificationStreamService {
  private readonly logger = new Logger(NotificationStreamService.name);
  private readonly bus = new Subject<StreamEvent>();
  /** Live connection count per user, for the admin health panel. */
  private readonly listeners = new Map<string, number>();

  publish(event: StreamEvent) {
    this.bus.next(event);
  }

  /** Fan one event out to many users without re-querying per recipient. */
  publishMany(userIds: string[], kind: StreamEvent['kind'], payload: unknown) {
    for (const userId of userIds) this.publish({ userId, kind, payload });
  }

  /**
   * The stream one user subscribes to. A 25s keep-alive comment is merged in:
   * idle SSE connections get closed by proxies (nginx defaults to 60s), and the
   * comment costs one line but keeps the socket warm.
   */
  subscribe(userId: string): Observable<{ data: string; type?: string }> {
    this.listeners.set(userId, (this.listeners.get(userId) ?? 0) + 1);

    const events = this.bus.pipe(
      filter((e) => e.userId === userId),
      map((e) => ({ type: e.kind, data: JSON.stringify(e.payload) })),
    );
    const keepAlive = timer(25_000, 25_000).pipe(
      map(() => ({ type: 'ping', data: JSON.stringify({ at: new Date().toISOString() }) })),
    );

    return new Observable<{ data: string; type?: string }>((subscriber) => {
      const sub = merge(events, keepAlive).subscribe(subscriber);
      return () => {
        sub.unsubscribe();
        const left = (this.listeners.get(userId) ?? 1) - 1;
        if (left <= 0) this.listeners.delete(userId);
        else this.listeners.set(userId, left);
      };
    });
  }

  stats() {
    let connections = 0;
    for (const n of this.listeners.values()) connections += n;
    return { connectedUsers: this.listeners.size, connections };
  }
}
