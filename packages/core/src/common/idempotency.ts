export class IdempotentEventInbox<T> {
  readonly #events = new Map<string, { payload: T; processed: boolean; result?: unknown }>();

  receive(eventId: string, payload: T): { duplicate: boolean } {
    if (this.#events.has(eventId)) return { duplicate: true };
    this.#events.set(eventId, { payload, processed: false });
    return { duplicate: false };
  }

  process<R>(eventId: string, handler: (payload: T) => R): { duplicateProcessing: boolean; result: R } {
    const event = this.#events.get(eventId);
    if (!event) throw new Error(`Unknown event ${eventId}`);
    if (event.processed) return { duplicateProcessing: true, result: event.result as R };
    const result = handler(event.payload);
    event.processed = true;
    event.result = result;
    return { duplicateProcessing: false, result };
  }
}
