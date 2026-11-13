import { useCallback, useEffect, useRef, useState } from 'react';
import type { ColumnValues } from './columnFilters';

const EMPTY: ColumnValues = {};
export function useColumnFilters(scopeKey: string, onReset: () => void) {
  const [state, setState] = useState({ key: scopeKey, values: EMPTY });
  const [settled, setSettled] = useState(state);
  const values = state.key === scopeKey ? state.values : EMPTY;
  const filters = settled.key === scopeKey ? settled.values : EMPTY;
  const scopeRef = useRef(scopeKey);
  const valuesRef = useRef(values);
  scopeRef.current = scopeKey;
  valuesRef.current = values;
  useEffect(() => {
    setState((previous) => previous.key === scopeKey ? previous : { key: scopeKey, values: EMPTY });
  }, [scopeKey]);
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ key: scopeKey, values }), 300);
    return () => clearTimeout(timer);
  }, [scopeKey, values]);
  const setField = useCallback((key: string, value: string) => {
    setState((previous) => ({ key: scopeRef.current, values: { ...(previous.key === scopeRef.current ? previous.values : EMPTY), [key]: value } }));
  }, []);
  const setFieldImmediate = useCallback((key: string, value: string) => {
    const next = { key: scopeRef.current, values: { ...valuesRef.current, [key]: value } };
    setState(next);
    setSettled(next);
  }, []);
  function reset() {
    const cleared = { key: scopeKey, values: EMPTY };
    setState(cleared);
    setSettled(cleared);
    onReset();
  }
  return { values, filters, setField, setFieldImmediate, reset };
}
