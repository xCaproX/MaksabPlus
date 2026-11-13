import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from '../components/Toast';
import { errorMessage } from './errors';
import { collectAllRows, type CountedPage } from './exportRows';

export interface LoadStatementOptions {
  preserveRows?: boolean;
}

export function useCompleteStatement<Row>() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => () => currentRequest.current?.abort(), []);

  const reset = useCallback(() => {
    currentRequest.current?.abort();
    currentRequest.current = null;
    setRows([]);
    setLoading(false);
  }, []);

  const load = useCallback(
    async (
      fetchPage: (from: number, to: number, signal: AbortSignal) => PromiseLike<CountedPage<Row>>,
      options?: LoadStatementOptions,
    ) => {
      if (options?.preserveRows) {
        currentRequest.current?.abort();
      } else {
        reset();
      }
      const request = new AbortController();
      currentRequest.current = request;
      setLoading(true);
      try {
        const complete = await collectAllRows((from, to) => fetchPage(from, to, request.signal));
        if (!request.signal.aborted) setRows(complete);
      } catch (error) {
        if (!request.signal.aborted) toast.error(errorMessage(error));
      } finally {
        if (!request.signal.aborted && currentRequest.current === request) {
          setLoading(false);
        }
      }
    },
    [reset],
  );

  return { rows, loading, load, reset };
}
