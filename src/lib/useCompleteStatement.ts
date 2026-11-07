import { useEffect, useRef, useState } from 'react';
import { toast } from '../components/Toast';
import { errorMessage } from './errors';
import { collectAllRows, type CountedPage } from './exportRows';

export function useCompleteStatement<Row>() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const currentRequest = useRef<AbortController | null>(null);

  useEffect(() => () => currentRequest.current?.abort(), []);

  function reset() {
    currentRequest.current?.abort();
    setRows([]);
    setLoading(false);
  }

  async function load(fetchPage: (from: number, to: number, signal: AbortSignal) => PromiseLike<CountedPage<Row>>) {
    reset();
    const request = new AbortController();
    currentRequest.current = request;
    setLoading(true);
    try {
      const complete = await collectAllRows((from, to) => fetchPage(from, to, request.signal));
      if (!request.signal.aborted) setRows(complete);
    } catch (error) {
      if (!request.signal.aborted) toast.error(errorMessage(error));
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }

  return { rows, loading, load, reset };
}
