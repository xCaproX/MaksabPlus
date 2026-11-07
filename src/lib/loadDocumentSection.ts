export async function loadDocumentSection<Result extends { error: unknown }>(
  signal: AbortSignal,
  request: PromiseLike<Result>,
  setPending: (pending: boolean) => void,
  setError: (failed: boolean) => void,
  publish: (result: Result) => void,
) {
  try {
    const result = await request;
    if (signal.aborted) return;
    if (result.error) throw result.error;
    publish(result);
  } catch {
    if (!signal.aborted) setError(true);
  } finally {
    if (!signal.aborted) setPending(false);
  }
}
