import { randomUUID } from "node:crypto";
import type { BugReport, Replay } from "@sdm/core/shared";

/** The replays of rooms that already closed, newest last, kept in memory only. */
export class ReplayStore {
  private readonly replays = new Map<string, Replay>();

  constructor(private readonly limit = 20) {}

  save(roomId: string, replay: Replay): void {
    this.replays.delete(roomId);
    this.replays.set(roomId, replay);
    while (this.replays.size > this.limit) this.replays.delete(this.replays.keys().next().value as string);
  }

  get(roomId: string): Replay | undefined {
    return this.replays.get(roomId);
  }
}

export interface StoredBugReport extends BugReport {
  id: string;
  createdAt: string;
  /** A copy of the room's replay at the time of the report, when the room was known. */
  replay?: Replay;
}

/** Bug reports kept in memory, the oldest dropped first. */
export class BugReportStore {
  private readonly reports = new Map<string, StoredBugReport>();

  constructor(private readonly limit = 200) {}

  add(report: BugReport, replay?: Replay): StoredBugReport {
    const stored: StoredBugReport = {
      ...report,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...(replay ? { replay } : {}),
    };
    this.reports.set(stored.id, stored);
    while (this.reports.size > this.limit) this.reports.delete(this.reports.keys().next().value as string);
    return stored;
  }

  get(id: string): StoredBugReport | undefined {
    return this.reports.get(id);
  }
}

/** At most `max` hits per `windowMs` for each key (the client's IP address). */
export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  allow(key: string): boolean {
    const now = this.now();
    const recent = (this.hits.get(key) ?? []).filter((at) => now - at < this.windowMs);
    if (recent.length >= this.max) {
      this.hits.set(key, recent);
      return false;
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 1000) this.prune(now);
    return true;
  }

  private prune(now: number): void {
    for (const [key, hits] of this.hits) {
      if (hits.every((at) => now - at >= this.windowMs)) this.hits.delete(key);
    }
  }
}

/** Token bucket: `perSecond` events per second with a burst of the same size. */
export class TokenBucket {
  private tokens: number;
  private last: number;

  constructor(
    private readonly perSecond: number,
    private readonly now: () => number = Date.now,
  ) {
    this.tokens = perSecond;
    this.last = this.now();
  }

  take(): boolean {
    const now = this.now();
    this.tokens = Math.min(this.perSecond, this.tokens + ((now - this.last) / 1000) * this.perSecond);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
