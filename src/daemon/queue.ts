type Job = () => Promise<void>;

interface QueueItem {
  job: Job;
  attempts: number;
}

const MAX_CONCURRENCY = 2;
const MAX_ATTEMPTS = 2;

const queue: QueueItem[] = [];
let active = 0;

function pump(): void {
  while (active < MAX_CONCURRENCY && queue.length > 0) {
    const item = queue.shift()!;
    active++;
    item.job()
      .catch((err) => {
        console.error('[queue] job failed:', err instanceof Error ? err.message : err);
        if (item.attempts < MAX_ATTEMPTS) {
          queue.push({ job: item.job, attempts: item.attempts + 1 });
        } else {
          console.error('[queue] job dropped after retry');
        }
      })
      .finally(() => {
        active--;
        pump();
      });
  }
}

/** Fire-and-forget: enqueue a job, return immediately. Caller never awaits completion. */
export function enqueue(job: Job): void {
  queue.push({ job, attempts: 0 });
  pump();
}

export function queueDepth(): number {
  return queue.length + active;
}
