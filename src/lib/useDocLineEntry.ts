import { useRef, useState, useCallback } from 'react';
import { FOCUS_SETTLE_DELAY_MS } from './ui';
import {
  clampDocQty,
  clampDocQtyOnBlur,
  mergeOrInsertDocLine,
  flushPendingDocLine,
  type DocLineBase,
} from './docLineEntry';
import type { SearchOption } from '../components/SearchableSelect';

export interface UseDocLineEntryOptions<T extends DocLineBase = DocLineBase> {
  lines: T[];
  setLines: (updater: T[] | ((prev: T[]) => T[])) => void;
  availableStock: number;
  isStockLimited: boolean;
  docLabel?: string;
  customWarning?: string;
}

export function useDocLineEntry<T extends DocLineBase = DocLineBase>({
  lines,
  setLines,
  availableStock,
  isStockLimited,
  docLabel = 'المستند',
  customWarning,
}: UseDocLineEntryOptions<T>) {
  const [entryItemId, setEntryItemId] = useState('');
  const [entryAsyncOption, setEntryAsyncOption] = useState<SearchOption | null>(null);
  const [entryQty, setEntryQty] = useState('1');
  const [entryUnitPrice, setEntryUnitPrice] = useState('');

  const entryItemSearchRef = useRef<HTMLInputElement>(null);
  const entryQtyInputRef = useRef<HTMLInputElement>(null);
  const entryPriceInputRef = useRef<HTMLInputElement>(null);

  const handleEntryQtyChange = useCallback(
    (val: string) => {
      setEntryQty(clampDocQty(val, availableStock, isStockLimited, customWarning));
    },
    [availableStock, isStockLimited, customWarning],
  );

  const handleEntryQtyBlur = useCallback(() => {
    setEntryQty((current) => clampDocQtyOnBlur(current, availableStock, isStockLimited));
  }, [availableStock, isStockLimited]);

  const resetEntry = useCallback(() => {
    setEntryItemId('');
    setEntryAsyncOption(null);
    setEntryQty('1');
    setEntryUnitPrice('');
    setTimeout(() => {
      entryItemSearchRef.current?.focus();
    }, FOCUS_SETTLE_DELAY_MS);
  }, []);

  const handleInsertLine = useCallback(
    (itemName?: string, extra?: Record<string, unknown>) => {
      const qtyNum = Number(entryQty || 0);
      const updated = mergeOrInsertDocLine<T>({
        lines,
        itemId: entryItemId,
        itemName,
        qty: qtyNum,
        availableStock,
        isStockLimited,
        extra,
        docLabel,
      });

      if (updated) {
        setLines(updated);
        resetEntry();
        return true;
      }
      return false;
    },
    [lines, entryItemId, entryQty, availableStock, isStockLimited, docLabel, setLines, resetEntry],
  );

  const flushPending = useCallback(
    (currentLines: T[], extra?: Record<string, unknown>): T[] => {
      if (!entryItemId) return currentLines;
      const flushed = flushPendingDocLine<T>(
        currentLines,
        entryItemId,
        entryQty,
        availableStock,
        isStockLimited,
        extra,
      );
      setLines(flushed);
      setEntryItemId('');
      setEntryQty('1');
      setEntryUnitPrice('');
      return flushed;
    },
    [entryItemId, entryQty, availableStock, isStockLimited, setLines],
  );

  return {
    entryItemId,
    setEntryItemId,
    entryAsyncOption,
    setEntryAsyncOption,
    entryQty,
    setEntryQty,
    entryUnitPrice,
    setEntryUnitPrice,
    entryItemSearchRef,
    entryQtyInputRef,
    entryPriceInputRef,
    handleEntryQtyChange,
    handleEntryQtyBlur,
    handleInsertLine,
    resetEntry,
    flushPending,
  };
}
