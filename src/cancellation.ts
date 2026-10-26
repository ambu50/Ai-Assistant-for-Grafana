// Settles the UI promptly on Stop even when the transport cannot cancel its request.
// The underlying operation may finish; callers must never dispatch follow-up work.
export function untilStopped<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const stopped = () => reject(new DOMException('Stopped', 'AbortError'));
    if (signal.aborted) { operation.catch(() => undefined); stopped(); return; }
    signal.addEventListener('abort', stopped, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', stopped));
  });
}
