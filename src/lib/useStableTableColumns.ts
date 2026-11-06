import { useLayoutEffect, useRef, type RefObject } from 'react';

interface TableSnapshot {
  key: string;
  table: HTMLTableElement;
  headers: HTMLTableCellElement[];
  originalLayout: string;
  originalSize: string;
  originalHeaderSizes: string[];
  ratios: number[];
  overflow: number;
}
function restore(snapshot: TableSnapshot | null) {
  if (!snapshot) return;
  snapshot.table.style.tableLayout = snapshot.originalLayout;
  snapshot.table.style.inlineSize = snapshot.originalSize;
  snapshot.headers.forEach((header, index) => { header.style.inlineSize = snapshot.originalHeaderSizes[index]; });
}

/** Keep the last natural column layout while loading or showing no results. */
export function useStableTableColumns(rowRef: RefObject<HTMLTableRowElement>, key: string) {
  const saved = useRef<TableSnapshot | null>(null);
  useLayoutEffect(() => {
    const table = rowRef.current?.closest('table');
    if (!table || !table.tHead?.rows[0] || table.tHead.rows[0] === rowRef.current) return;
    const headers = Array.from(table.tHead.rows[0].cells);
    if (saved.current?.table !== table || saved.current.key !== key || saved.current.headers.length !== headers.length) {
      restore(saved.current);
      saved.current = { key, table, headers, originalLayout: table.style.tableLayout,
        originalSize: table.style.inlineSize, originalHeaderSizes: headers.map((header) => header.style.inlineSize),
        ratios: [], overflow: 0 };
    }
    const snapshot = saved.current;
    const hasRecords = Array.from(table.tBodies).some((body) =>
      Array.from(body.rows).some((row) => row.cells.length > 1 && !row.querySelector('td[colspan]')),
    );
    if (hasRecords || !snapshot.ratios.length) {
      restore(snapshot);
      // At first empty load, reserve room for reset rather than the missing actions.
      if (!hasRecords && !headers[headers.length - 1]?.textContent?.trim()) headers[headers.length - 1]!.style.inlineSize = '52px';
      const width = table.getBoundingClientRect().width;
      if (!width) return;
      snapshot.ratios = headers.map((header) => header.getBoundingClientRect().width / width);
      snapshot.overflow = Math.max(0, width - (table.parentElement?.clientWidth ?? width));
    }
    if (!hasRecords) {
      table.style.tableLayout = 'fixed';
      table.style.inlineSize = 'calc(100% + ' + snapshot.overflow + 'px)';
      headers.forEach((header, index) => { header.style.inlineSize = (snapshot.ratios[index] * 100) + '%'; });
    }
  });
  useLayoutEffect(() => () => restore(saved.current), []);
}
