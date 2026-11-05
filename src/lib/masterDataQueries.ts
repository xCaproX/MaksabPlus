import { supabase } from './supabase';
import { qty as formatQty } from './format';
import { buildPostgrestOrFilter } from './search';
import type { AccountKind } from './types';
import type { SearchOption } from '../components/SearchableSelect';

interface AccountQueryResult {
  id: string;
  name: string;
  phone: string | null;
  serial_number: number | null;
  kind: AccountKind;
  balance: number;
  system_key: string | null;
}

interface WarehouseItemQueryResult {
  item_id: string;
  item_name: string;
  item_code: string;
  unit: string;
  current_qty: number;
  sale_price: number;
  purchase_price: number;
}

export interface WarehouseItemOption extends SearchOption {
  value: string;
  label: string;
  stock: number;
  salePrice: number;
  purchasePrice: number;
  unit: string;
  code: string;
  costLocked: boolean;
}

/**
 * بحث لحظي في الحسابات (عملاء / موردين) مع حد أقصى للنتائج
 */
export async function searchAccountsAsync(
  kind: AccountKind,
  query: string = '',
  limit: number = 25,
): Promise<SearchOption[]> {
  const trimmed = query.trim();

  let req = supabase
    .from('v_account_balances')
    .select('id, name, phone, serial_number, kind, balance, system_key')
    .eq('kind', kind)
    .eq('is_active', true)
    .is('system_key', null)
    .order('name')
    .limit(limit);

  if (trimmed) {
    req = req.or(buildPostgrestOrFilter(['name', 'phone', 'serial_number'], trimmed));
  }

  const { data, error } = await req;
  if (error || !data) return [];

  return (data as unknown as AccountQueryResult[]).map((acc) => ({
    value: acc.id,
    label: acc.phone ? `${acc.name} — ${acc.phone}` : acc.name,
    sublabel: acc.serial_number ? `#${acc.serial_number}` : undefined,
  }));
}

/**
 * بحث لحظي في أصناف المخزن المحدد مع رصيدها وأسعارها
 */
export async function searchWarehouseItemsAsync(
  warehouseId: string,
  query: string = '',
  isStockLimited: boolean = false,
  limit: number = 25,
): Promise<WarehouseItemOption[]> {
  if (!warehouseId) return [];
  const trimmed = query.trim();

  let req = supabase
    .from('v_warehouse_items')
    .select('item_id, item_name, item_code, unit, current_qty, sale_price, purchase_price')
    .eq('warehouse_id', warehouseId)
    .order('item_name')
    .limit(limit);

  if (trimmed) {
    req = req.or(buildPostgrestOrFilter(['item_name', 'item_code'], trimmed));
  }

  const { data, error } = await req;
  if (error || !data) return [];

  return (data as unknown as WarehouseItemQueryResult[]).map((row) => {
    const stock = Number(row.current_qty || 0);
    const isOut = isStockLimited && stock <= 0;
    return {
      value: row.item_id,
      label: `${row.item_code} — ${row.item_name} — متاح: ${formatQty(stock)} ${row.unit}${isOut ? ' (غير متوفر)' : ''}`,
      stock,
      salePrice: Number(row.sale_price || 0),
      purchasePrice: Number(row.purchase_price || 0),
      unit: row.unit,
      code: row.item_code,
      costLocked: false,
    };
  });
}

/**
 * استعلام مباشر ودقيق عن الصنف بواسطة الباركود / الكود
 */
export async function lookupBarcodeItem(
  barcode: string,
  warehouseId: string,
  isStockLimited: boolean = false,
): Promise<WarehouseItemOption | null> {
  const trimmed = barcode.trim();
  if (!trimmed || !warehouseId) return null;

  // 1. البحث في مخزن الفاتورة الحالي أولاً
  const { data: stockRow } = await supabase
    .from('v_warehouse_items')
    .select('item_id, item_name, item_code, unit, current_qty, sale_price, purchase_price')
    .eq('warehouse_id', warehouseId)
    .ilike('item_code', trimmed)
    .maybeSingle();

  if (stockRow) {
    const stock = Number(stockRow.current_qty || 0);
    const isOut = isStockLimited && stock <= 0;
    return {
      value: stockRow.item_id,
      label: `${stockRow.item_code} — ${stockRow.item_name} — متاح: ${formatQty(stock)} ${stockRow.unit}${isOut ? ' (غير متوفر)' : ''}`,
      stock,
      salePrice: Number(stockRow.sale_price || 0),
      purchasePrice: Number(stockRow.purchase_price || 0),
      unit: stockRow.unit,
      code: stockRow.item_code,
      costLocked: false,
    };
  }

  // 2. إذا لم يكن متوفراً في هذا المخزن، البحث في جدول الأصناف العام
  const { data: item } = await supabase
    .from('items')
    .select('id, name, code, unit, sale_price, purchase_price')
    .ilike('code', trimmed)
    .eq('is_active', true)
    .maybeSingle();

  if (item) {
    return {
      value: item.id,
      label: `${item.code} — ${item.name} — متاح: 0 ${item.unit} (غير متوفر)`,
      stock: 0,
      salePrice: Number(item.sale_price || 0),
      purchasePrice: Number(item.purchase_price || 0),
      unit: item.unit,
      code: item.code,
      costLocked: false,
    };
  }

  return null;
}
