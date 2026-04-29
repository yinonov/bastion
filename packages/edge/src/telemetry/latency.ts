export type HookLatencySnapshot = {
  count: number;
  p95Ms: number;
  avgMs: number;
  maxMs: number;
};

export type HookLatencyTracker = {
  record: (ms: number) => void;
  snapshot: () => HookLatencySnapshot;
};

const DEFAULT_MAX_SAMPLES = 2048;

export type HookLatencyTrackerOptions = {
  maxSamples?: number;
  initialSamples?: number[];
};

export function createHookLatencyTracker(options: HookLatencyTrackerOptions = {}): HookLatencyTracker {
  const maxSamples = options.maxSamples ?? DEFAULT_MAX_SAMPLES;
  const samples: number[] = [];

  for (const value of options.initialSamples ?? []) {
    if (!Number.isFinite(value) || value < 0) {
      continue;
    }
    samples.push(value);
    if (samples.length > maxSamples) {
      samples.shift();
    }
  }

  return {
    record(ms: number) {
      if (!Number.isFinite(ms) || ms < 0) {
        return;
      }
      samples.push(ms);
      if (samples.length > maxSamples) {
        samples.shift();
      }
    },
    snapshot() {
      if (samples.length === 0) {
        return { count: 0, p95Ms: 0, avgMs: 0, maxMs: 0 };
      }

      const sorted = [...samples].sort((a, b) => a - b);
      const p95Index = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1);
      const total = samples.reduce((sum, value) => sum + value, 0);

      return {
        count: samples.length,
        p95Ms: roundLatency(sorted[p95Index] ?? 0),
        avgMs: roundLatency(total / samples.length),
        maxMs: roundLatency(sorted[sorted.length - 1] ?? 0)
      };
    }
  };
}

function roundLatency(value: number): number {
  return Math.round(value * 100) / 100;
}