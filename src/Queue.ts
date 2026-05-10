import { Track } from "./types";

export class Queue {
  public current: Track | null = null;
  public previous: Track | null = null;
  private tracks: Track[] = [];

  // ─── Basic Operations ─────────────────────────────────────────────

  /** Add tracks to the end of the queue */
  public add(tracks: Track | Track[]): void {
    const arr = Array.isArray(tracks) ? tracks : [tracks];
    this.tracks.push(...arr);
  }

  /** Remove and return the next track */
  public next(): Track | null {
    if (this.current) this.previous = this.current;
    this.current = this.tracks.shift() ?? null;
    return this.current;
  }

  /** Peek at upcoming tracks without modifying queue */
  public peek(count: number = 5): Track[] {
    return this.tracks.slice(0, count);
  }

  /** Remove a track at a specific index */
  public remove(index: number): Track | null {
    if (index < 0 || index >= this.tracks.length) return null;
    const [removed] = this.tracks.splice(index, 1);
    return removed;
  }

  /** Clear all queued tracks (does not affect current) */
  public clear(): void {
    this.tracks = [];
    this.current = null;
    this.previous = null;
  }

  // ─── Shuffle ──────────────────────────────────────────────────────

  /** Fisher-Yates shuffle */
  public shuffle(): void {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.tracks[i], this.tracks[j]] = [this.tracks[j], this.tracks[i]];
    }
  }

  // ─── Move / Reorder ───────────────────────────────────────────────

  /** Move a track from one position to another */
  public move(from: number, to: number): void {
    if (from < 0 || to < 0 || from >= this.tracks.length || to >= this.tracks.length) return;
    const [track] = this.tracks.splice(from, 1);
    this.tracks.splice(to, 0, track);
  }

  // ─── Getters ──────────────────────────────────────────────────────

  /** Total tracks in queue (not including current) */
  get size(): number {
    return this.tracks.length;
  }

  /** Total duration of all queued tracks in ms */
  get totalDuration(): number {
    return this.tracks.reduce((acc, t) => acc + (t.info.length ?? 0), 0);
  }

  /** Whether the queue is empty */
  get isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  /** All tracks as array (read-only view) */
  get list(): ReadonlyArray<Track> {
    return this.tracks;
  }
}
