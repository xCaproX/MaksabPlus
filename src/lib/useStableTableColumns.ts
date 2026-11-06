import { useLayoutEffect, useRef, type RefObject } from 'react';

interface TableSnapshot {
  key: string;
  table: HTMLTableElement;
  headers: HTMLTableCellElement[];
  originalLayout: string;
  originalSize: string;
  originalHeaderSizes: string[];
  widths: number[];
  fixedWidths: number[];
  minimums: number[];
  overflow: number;
}
function restore(snapshot: TableSnapshot | null) {
  if (!snapshot) return;
  delete snapshot.table.dataset.columnsFrozen;
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
        widths: [], fixedWidths: [], minimums: [], overflow: 0 };
    }
    const snapshot = saved.current;
    const hasRecords = Array.from(table.tBodies).some((body) =>
      Array.from(body.rows).some((row) => row.cells.length > 1 && !row.querySelector('td[colspan]')),
    );
    if (hasRecords || !snapshot.widths.length) {
      restore(snapshot);
      // At first empty load, reserve room for reset rather than the missing actions.
      if (!hasRecords && !headers[headers.length - 1]?.textContent?.trim()) headers[headers.length - 1]!.style.inlineSize = '52px';
      const width = table.getBoundingClientRect().width;
      if (!width) return;
      snapshot.widths = headers.map((header) => header.getBoundingClientRect().width);
      snapshot.minimums = headers.map((header) => getComputedStyle(header).display === 'none' ? 0 : parseFloat(getComputedStyle(header).minInlineSize) || 0);
      snapshot.fixedWidths = headers.map((header, index) => {
        const style = getComputedStyle(header);
        if (style.display === 'none') return 0;
        if (header.matches('.col-date, .col-time, .col-datetime')) return snapshot.minimums[index];
        return style.getPropertyValue('--preserve-column-width').trim() === '1' ? snapshot.widths[index] : 0;
      });
      snapshot.overflow = Math.max(0, width - (table.parentElement?.clientWidth ?? width));
    }
    if (!hasRecords) {
      const fixedTotal = snapshot.fixedWidths.reduce((sum, value) => sum + value, 0);
      const weights = snapshot.widths.map((value, index) => snapshot.fixedWidths[index] ? 0 : Math.max(0, value - snapshot.minimums[index]));
      const totalWeight = weights.reduce((sum, value) => sum + value, 0);
      const sizeEmptyTable = () => {
        const minimums = headers.map((header, index) => snapshot.fixedWidths[index] || getComputedStyle(header).display === 'none'
          ? 0 : parseFloat(getComputedStyle(header).minInlineSize) || 0);
        const minimumTotal = minimums.reduce((sum, value) => sum + value, 0);
        const width = Math.max((table.parentElement?.clientWidth ?? 0) + snapshot.overflow,
          parseFloat(getComputedStyle(table).minInlineSize) || 0, fixedTotal + minimumTotal);
        const extra = width - fixedTotal - minimumTotal;
        table.dataset.columnsFrozen = 'true';
        table.style.tableLayout = 'fixed';
        table.style.inlineSize = width + 'px';
        headers.forEach((header, index) => {
          const size = snapshot.fixedWidths[index] || (minimums[index] + (totalWeight ? extra * weights[index] / totalWeight : 0));
          header.style.inlineSize = size + 'px';
        });
      };
      sizeEmptyTable();
      const observer = new ResizeObserver(sizeEmptyTable);
      if (table.parentElement) observer.observe(table.parentElement);
      return () => observer.disconnect();
    }
  });
  useLayoutEffect(() => () => restore(saved.current), []);
}
