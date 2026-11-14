import { monitorEventLoopDelay } from "node:perf_hooks";
import type { RegisteredRoom, RoomRegistry, RoomStats } from "./registry";

export interface ProcessStats {
  uptimeSeconds: number;
  rooms: number;
  players: number;
  memory: { rssMb: number; heapUsedMb: number };
  eventLoopLagMs: { mean: number; p99: number; max: number };
}

export interface StatsResponse {
  process: ProcessStats;
  rooms: RoomStats[];
}

const toMb = (bytes: number) => Math.round((bytes / 1024 / 1024) * 10) / 10;
const RESOLUTION_MS = 20;
/** The histogram counts the timer interval too, so the resolution is taken off to get the lateness. */
const toLagMs = (nanoseconds: number) =>
  Number.isFinite(nanoseconds) ? Math.max(0, Math.round((nanoseconds / 1e6 - RESOLUTION_MS) * 100) / 100) : 0;

/** Measures how late the event loop wakes up; started with the server and stopped on shutdown. */
export class ProcessMonitor {
  private readonly lag = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  private readonly startedAt = Date.now();

  constructor(private readonly registry: RoomRegistry) {
    this.lag.enable();
  }

  snapshot(): StatsResponse {
    const rooms = this.registry.list().map((room: RegisteredRoom) => room.stats());
    const memory = process.memoryUsage();
    return {
      process: {
        uptimeSeconds: Math.round((Date.now() - this.startedAt) / 1000),
        rooms: rooms.length,
        players: rooms.reduce((sum, room) => sum + room.players, 0),
        memory: { rssMb: toMb(memory.rss), heapUsedMb: toMb(memory.heapUsed) },
        eventLoopLagMs: { mean: toLagMs(this.lag.mean), p99: toLagMs(this.lag.percentile(99)), max: toLagMs(this.lag.max) },
      },
      rooms,
    };
  }

  /** Clears the lag window, so the next snapshot covers only the time since this call. */
  reset(): void {
    this.lag.reset();
  }

  stop(): void {
    this.lag.disable();
  }
}
