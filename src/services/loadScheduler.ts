export type LoadGroup = 'home' | 'catalog' | 'detail' | 'player' | 'system' | 'background' | 'local';
type Job = { group: LoadGroup; key: string; order: number; run: (signal: AbortSignal) => Promise<unknown>; resolve: (value: any) => void; reject: (error: unknown) => void; controller?: AbortController; preempted: boolean; promise: Promise<any> };

/** GET requests can yield their slot when the user moves to another page. */
export class LoadScheduler {
  private activeGroup: LoadGroup = 'home';
  private order = 0;
  private pending: Job[] = [];
  private running = new Set<Job>();
  private jobs = new Map<string, Job>();
  constructor(private maxConcurrent = 2) {}
  setActiveGroup(group: LoadGroup) {
    if (this.activeGroup === group) return;
    const previous = this.activeGroup;
    this.activeGroup = group;
    for (const job of this.running) {
      if (job.group === previous && job.group !== 'system') {
        job.preempted = true;
        job.controller?.abort();
      }
    }
    this.drain();
  }
  schedule<T>(group: LoadGroup, key: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
    const existing = this.jobs.get(key);
    if (existing) return existing.promise;
    let resolve!: (value: T) => void;
    let reject!: (error: unknown) => void;
    const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
    const job: Job = { group, key, order: this.order++, run, resolve, reject, promise, preempted: false };
    this.jobs.set(key, job);
    this.pending.push(job);
    this.drain();
    return promise;
  }
  private rank(job: Job) { return job.group === 'system' ? 0 : job.group === this.activeGroup ? 1 : 2; }
  private drain() {
    this.pending.sort((a, b) => this.rank(a) - this.rank(b) || a.order - b.order);
    while (this.running.size < this.maxConcurrent && this.pending.length) {
      const job = this.pending[0];
      // One background transfer leaves capacity for a newly opened page.
      if (this.rank(job) === 2 && [...this.running].some(item => this.rank(item) === 2)) break;
      this.pending.shift();
      job.preempted = false;
      job.controller = new AbortController();
      this.running.add(job);
      Promise.resolve().then(() => job.run(job.controller!.signal)).then(value => {
        if (job.preempted) this.pending.push(job);
        else { this.jobs.delete(job.key); job.resolve(value); }
      }, error => {
        if (job.preempted) this.pending.push(job);
        else { this.jobs.delete(job.key); job.reject(error); }
      }).finally(() => { this.running.delete(job); this.drain(); });
    }
  }
}
export default new LoadScheduler();
