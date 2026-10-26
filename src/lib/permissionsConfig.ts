export type ActionKey = 'view' | 'create' | 'edit' | 'delete';

export interface PermissionItemDef {
  id: string;
  label: string;
  actions: ActionKey[];
}

export interface SectionDef {
  id: string;
  label: string;
  items: PermissionItemDef[];
}

export type PermissionKey = `${string}.${ActionKey}`;

export interface PermissionPreset {
  id: string;
  label: string;
  keys: PermissionKey[];
}

/**
 * الهيكل الديناميكي لصلاحيات النظام:
 * كل قسم رئيسي يضم بنوده الفرعية والإجراءات المسموح بها لكل بند
 */
export const PERMISSION_SECTIONS: SectionDef[] = [
  {
    id: 'goods',
    label: 'قسم البضاعة',
    items: [
      { id: 'goods.sale', label: 'فواتير المبيعات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.purchase', label: 'فواتير المشتريات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.sale_return', label: 'مرتجعات المبيعات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.purchase_return', label: 'مرتجعات المشتريات', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.waste', label: 'الهالك والتوالف', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'goods.warehouse_transfer', label: 'التحويل بين المخازن', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    id: 'money',
    label: 'قسم الفلوس',
    items: [
      { id: 'money.in', label: 'إيصالات الاستلام (سندات القبض)', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'money.out', label: 'إيصالات الصرف (سندات الدفع)', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'money.cash_box_transfer', label: 'التحويل بين الخزن', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    id: 'data',
    label: 'قسم البيانات الأساسية',
    items: [
      { id: 'data.customers', label: 'دليل العملاء', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.suppliers', label: 'دليل الموردين', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.items', label: 'دليل الأصناف', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.warehouses', label: 'دليل المخازن', actions: ['view', 'create', 'edit', 'delete'] },
      { id: 'data.cashBoxes', label: 'دليل الخزن', actions: ['view', 'create', 'edit', 'delete'] },
    ],
  },
  {
    id: 'balances',
    label: 'قسم الأرصدة والتقارير',
    items: [
      { id: 'balances.customers', label: 'كشوف وحسابات العملاء', actions: ['view'] },
      { id: 'balances.suppliers', label: 'كشوف وحسابات الموردين', actions: ['view'] },
      { id: 'balances.items', label: 'أرصدة وحركات الأصناف', actions: ['view'] },
      { id: 'balances.cashBoxes', label: 'أرصدة وحركات الخزن', actions: ['view'] },
    ],
  },
  {
    id: 'management',
    label: 'قسم إدارة الأرصدة الافتتاحية',
    items: [
      { id: 'management.customers', label: 'افتتاحيات العملاء', actions: ['view', 'edit'] },
      { id: 'management.suppliers', label: 'افتتاحيات الموردين', actions: ['view', 'edit'] },
      { id: 'management.items', label: 'افتتاحيات المخزون', actions: ['view', 'edit'] },
      { id: 'management.cashBoxes', label: 'افتتاحيات الخزن', actions: ['view', 'edit'] },
    ],
  },
];

/**
 * جمع كافة الصلاحيات المتاحة في النظام كقائمة واحدة
 */
export function getAllPermissionKeys(): PermissionKey[] {
  return PERMISSION_SECTIONS.flatMap((section) =>
    section.items.flatMap((item) =>
      item.actions.map((action) => `${item.id}.${action}` as PermissionKey),
    ),
  );
}

/**
 * قوالب الصلاحيات السريعة لتوفير الوقت
 */
export const PERMISSION_PRESETS: PermissionPreset[] = [

  {
    id: 'cashier',
    label: 'كاشير / مبيعات',
    keys: [
      'goods.sale.view', 'goods.sale.create',
      'goods.sale_return.view', 'goods.sale_return.create',
      'money.in.view', 'money.in.create',
      'data.customers.view',
      'data.items.view',
    ],
  },
  {
    id: 'warehouse',
    label: 'أمين مخزن',
    keys: [
      'goods.warehouse_transfer.view', 'goods.warehouse_transfer.create', 'goods.warehouse_transfer.edit',
      'goods.waste.view', 'goods.waste.create',
      'data.items.view', 'data.items.create', 'data.items.edit',
      'data.warehouses.view',
      'balances.items.view',
    ],
  },
  {
    id: 'accountant',
    label: 'محاسب مالي',
    keys: [
      'goods.sale.view', 'goods.sale.create', 'goods.sale.edit',
      'goods.purchase.view', 'goods.purchase.create', 'goods.purchase.edit',
      'goods.sale_return.view', 'goods.sale_return.create', 'goods.sale_return.edit',
      'goods.purchase_return.view', 'goods.purchase_return.create', 'goods.purchase_return.edit',
      'goods.warehouse_transfer.view', 'goods.warehouse_transfer.create',
      'money.in.view', 'money.in.create', 'money.in.edit',
      'money.out.view', 'money.out.create', 'money.out.edit',
      'money.cash_box_transfer.view', 'money.cash_box_transfer.create',
      'data.customers.view', 'data.customers.create', 'data.customers.edit',
      'data.suppliers.view', 'data.suppliers.create', 'data.suppliers.edit',
      'data.items.view', 'data.warehouses.view', 'data.cashBoxes.view',
      'balances.customers.view', 'balances.suppliers.view', 'balances.items.view', 'balances.cashBoxes.view',
    ],
  },
  {
    id: 'viewer',
    label: 'مشاهد فقط',
    keys: [
      'goods.sale.view', 'goods.purchase.view', 'goods.sale_return.view', 'goods.purchase_return.view',
      'goods.waste.view', 'goods.warehouse_transfer.view',
      'money.in.view', 'money.out.view', 'money.cash_box_transfer.view',
      'data.customers.view', 'data.suppliers.view', 'data.items.view', 'data.warehouses.view', 'data.cashBoxes.view',
      'balances.customers.view', 'balances.suppliers.view', 'balances.items.view', 'balances.cashBoxes.view',
      'management.customers.view', 'management.suppliers.view', 'management.items.view', 'management.cashBoxes.view',
    ],
  },
];

export const sections = PERMISSION_SECTIONS;
export const PRESETS = PERMISSION_PRESETS;

