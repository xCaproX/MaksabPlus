import { useEffect, useState } from 'react';
import type { ColumnValues } from './columnFilters';

const EMPTY: ColumnValues = {};
export function useColumnFilters(scopeKey: string, onReset: () => void) {
  const [state, setState] = useState({ key: scopeKey, values: EMPTY });
  const [settled, setSettled] = useState(state);
  const values = state.key === scopeKey ? state.values : EMPTY;
  const filters = settled.key === scopeKey ? settled.values : EMPTY;
  useEffect(() => {
    setState((previous) => previous.key === scopeKey ? previous : { key: scopeKey, values: EMPTY });
  }, [scopeKey]);
  useEffect(() => {
    const timer = setTimeout(() => setSettled({ key: scopeKey, values }), 300);
    return () => clearTimeout(timer);
  }, [scopeKey, values]);
  function setField(key: string, value: string) {
    setState((previous) => ({ key: scopeKey, values: { ...(previous.key === scopeKey ? previous.values : EMPTY), [key]: value } }));
  }
  function reset() {
    const cleared = { key: scopeKey, values: EMPTY };
    setState(cleared);
    setSettled(cleared);
    onReset();
  }
  return { values, filters, setField, reset };
}
