export type InvoiceKind = 'sale' | 'purchase' | 'sale_return' | 'purchase_return' | 'waste';
export type AccountKind = 'customer' | 'supplier' | 'waste';
export type ReceiptDirection = 'in' | 'out';

export interface AccountRow {
  id: string;
  serial_number: number | null;
  name: string;
  kind: AccountKind;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
  opening_balance: number;
  invoiced: number;
  paid: number;
  balance: number;
  has_documents: boolean;
  system_key: 'cash_customer' | 'cash_supplier' | 'waste' | null;
}

export interface AccountStatementRow {
  row_type: 'opening' | 'movement';
  transaction_date: string;
  description: string;
  invoice_number: string | null;
  receipt_number: string | null;
  debit: number;
  credit: number;
  running_balance: number;
  total_debit: number;
  total_credit: number;
}

export interface CashBoxStatementRow {
  row_type: 'opening' | 'movement';
  transaction_date: string;
  description: string;
  receipt_number: string | null;
  transfer_number: string | null;
  incoming: number;
  outgoing: number;
  running_balance: number;
  total_incoming: number;
  total_outgoing: number;
}

export interface ItemMovementStatementRow {
  row_type: 'opening' | 'movement';
  transaction_date: string;
  description: string;
  invoice_number: string | null;
  transfer_number: string | null;
  incoming: number;
  outgoing: number;
  running_balance: number;
  total_incoming: number;
  total_outgoing: number;
}

export interface ItemRow {
  id: string;
  serial_number: number;
  code: string;
  name: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
  is_active: boolean;
  qty: number;
  notes?: string | null;
}

export interface WarehouseOption {
  id: string;
  name: string;
  serial_number?: number;
  notes?: string | null;
  is_active?: boolean;
  is_primary?: boolean;
}

export interface CashBoxRow {
  id: string;
  serial_number: number;
  name: string;
  is_active: boolean;
  balance: number;
  opening_balance: number;
  is_primary: boolean;
  notes: string | null;
}

export interface StockOpeningRow {
  item_id: string;
  item_number: number;
  item_code: string;
  item_name: string;
  unit: string;
  warehouse_id: string;
  warehouse_number: number;
  warehouse_name: string;
  warehouse_notes: string | null;
  opening_qty: number;
  unit_cost: number;
  current_qty: number;
  cost_locked: boolean;
  item_notes: string | null;
}

export interface InvoiceRow {
  id: string;
  kind: InvoiceKind;
  number: string;
  invoice_date: string;
  account_id: string;
  account_name: string;
  account_kind: AccountKind;
  cost_total: number;
  profit_total: number;
  warehouse_id: string;
  warehouse_name: string;
  subtotal: number;
  total: number;
  paid: number;
  remaining: number;
  notes: string | null;
  receipt_id: string | null;
  receipt_number: string | null;
  receipt_amount: number | null;
  cash_box_id?: string | null;
  cash_box_name?: string | null;
  deleted_at: string | null;
}

export interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  item_id: string;
  item_name: string;
  unit: string;
  qty: number;
  unit_price: number;
  line_total: number;
  unit_cost: number;
  line_cost: number;
  line_profit: number;
}

export interface ReceiptRow {
  id: string;
  number: string;
  receipt_date: string;
  amount: number;
  notes: string | null;
  description: string | null;
  statement: string | null;
  account_id: string;
  account_name: string;
  account_kind: AccountKind;
  cash_box_id: string;
  cash_box_name: string;
  invoice_id: string | null;
  invoice_number: string | null;
  invoice_kind: InvoiceKind | null;
  is_free: boolean;
  deleted_at: string | null;
  direction: ReceiptDirection;
}

export interface WarehouseTransferRow {
  id: string;
  number: string;
  transfer_date: string;
  source_warehouse_id: string;
  source_warehouse_name: string;
  destination_warehouse_id: string;
  destination_warehouse_name: string;
  notes: string | null;
  deleted_at: string | null;
  line_count: number;
  total_qty: number;
  total_value: number;
  items_summary: string;
}

export interface WarehouseTransferLine {
  item_id: string;
  item_name?: string;
  qty: number;
  unit_cost?: number;
}

export interface CashBoxTransferRow {
  id: string;
  number: string;
  transfer_date: string;
  source_cash_box_id: string;
  source_cash_box_name: string;
  destination_cash_box_id: string;
  destination_cash_box_name: string;
  amount: number;
  notes: string | null;
  deleted_at: string | null;
}

export interface LineDraft {
  key: string;
  item_id: string;
  qty: string;
  unit_price: string;
}
