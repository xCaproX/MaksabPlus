export type InvoiceKind = 'sale' | 'purchase';
export type AccountKind = 'customer' | 'supplier';
export type ReceiptDirection = 'in' | 'out';

export interface AccountRow {
  id: string;
  name: string;
  kind: AccountKind;
  phone: string | null;
  is_active: boolean;
  invoiced: number;
  paid: number;
  balance: number;
  has_documents: boolean;
}

export interface ItemRow {
  id: string;
  name: string;
  unit: string;
  sale_price: number;
  purchase_price: number;
  is_active: boolean;
  qty: number;
}

export interface WarehouseOption {
  id: string;
  name: string;
}

export interface CashBoxRow {
  id: string;
  name: string;
  is_active: boolean;
  balance: number;
}

export interface InvoiceRow {
  id: string;
  kind: InvoiceKind;
  number: string;
  invoice_date: string;
  account_id: string;
  account_name: string;
  account_kind: AccountKind;
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

export interface LineDraft {
  key: string;
  item_id: string;
  qty: string;
  unit_price: string;
}
