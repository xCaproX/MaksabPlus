import type { CellObject, SheetData } from 'write-excel-file/browser';
import { columnValue, listColumns, type ColumnSpec } from './columnFilters';
import { accountKindLabel, creationTime, formatDate, saleStatusLabel } from './format';
import { documentListQuery, type DocumentListOptions } from './documentListQuery';
import { collectExportRows } from './exportRows';

export interface DocumentExportOptions extends DocumentListOptions {
  title: string;
  canViewProfit: boolean;
}
function exportCell(row: Record<string, unknown>, column: ColumnSpec, isReturn: boolean): CellObject {
  let value = columnValue(row, column);
  if (column.key.endsWith('_id')) value = row[column.key.replace(/_id$/, '_name')];
  if (column.key === 'account') value = row.account_name;
  if (column.key === 'account_kind') value = accountKindLabel(String(value));
  else if (column.format === 'payment_status') value = saleStatusLabel(value as 'paid' | 'partial' | 'unpaid', isReturn);
  else if (Array.isArray(column.options)) value = column.options.find(option=>option.value===value)?.label ?? value;
  if (value == null || value === '') value = '—';
  if (column.type === 'number' && value !== '—') {
    const number = Number(value);
    if (!Number.isFinite(number)) throw new Error('توجد قيمة رقمية غير صالحة في بيانات التصدير.');
    return { type: Number, value: number, format: column.key === 'line_count' ? '0' : column.key === 'total_qty' ? '#,##0.####' : '#,##0.00', align: 'right' };
  }
  if (column.type === 'date' && value !== '—') {
    const date = new Date(String(value).slice(0,10)+'T00:00:00Z');
    if (!Number.isNaN(date.getTime())) return { type: Date, value: date, format: 'dd/mm/yyyy', align: 'right' };
    value = formatDate(String(value));
  }
  if (column.type === 'time') value = creationTime(String(row[column.source ?? column.key] ?? ''));
  // Explicit strings prevent notes and names beginning with "=" from becoming formulas.
  return { type: String, value: String(value), align: 'right', wrap: true };
}

export function documentExcelData(rows: Record<string, unknown>[], options: DocumentExportOptions) {
  const columns = listColumns(options.scope, options.canViewProfit, options.kind).filter(column=>column.type!=='none');
  const isReturn = options.kind === 'sale_return' || options.kind === 'purchase_return';
  const headers: CellObject[] = columns.map(column=>({
    type: String, value: isReturn && column.key === 'paid' ? 'المسترد'
      : isReturn && column.key === 'remaining' ? 'غير المسترد' : column.label,
    fontWeight: 'bold', backgroundColor: '#2E435C', color: '#FFFFFF', align: 'right', wrap: true,
  }));
  const data: SheetData = [headers, ...rows.map(row=>columns.map(column=>exportCell(row,column,isReturn)))];
  return { data, columns: columns.map(column=>({width: ['account','statement','notes','created_by_name'].includes(column.key) ? 28 : column.type==='date' ? 14 : 18})) };
}
export async function exportDocumentExcel(options: DocumentExportOptions) {
  const rows = await collectExportRows<Record<string, unknown>>((from,to)=>documentListQuery<Record<string, unknown>>(options).range(from,to));
  const { data, columns } = documentExcelData(rows,options);
  const { default: writeExcelFile } = await import('write-excel-file/browser');
  await writeExcelFile(data,{
    sheet: options.title.slice(0,31), rightToLeft: true, stickyRowsCount: 1, columns,
  },{fontFamily:'Arial',fontSize:11}).toFile(options.title+'.xlsx');
}
