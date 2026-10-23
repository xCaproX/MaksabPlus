const MESSAGES: Record<string, string> = {
  paid_exceeds_total: 'المدفوع أكبر من إجمالي الفاتورة',
  cash_account_requires_full_payment: 'الحساب نقدي ويجب سداد/استرداد إجمالي المستند كاملًا',
  system_account_protected: 'هذا حساب ثابت لا يمكن تعديله أو حذفه',
  account_name_required: 'أدخل اسم الحساب',
  invalid_account_kind: 'نوع الحساب غير صحيح',
  invalid_opening_balance: 'أدخل رصيدًا افتتاحيًا صحيحًا',
  invalid_opening_balances: 'بيانات الأرصدة الافتتاحية غير صحيحة',
  invalid_opening_qty: 'كمية البداية يجب ألا تكون سالبة',
  opening_stock_cost_locked: 'لا يمكن تغيير تكلفة البداية بعد تسجيل حركات على الصنف. يمكن تصحيح الكمية فقط.',
  insufficient_stock: 'الكمية المتاحة في المخزن لا تكفي لهذه الحركة',
  waste_price_must_be_zero: 'فاتورة الهالك لا تحمل سعر بيع',
  waste_cannot_be_paid: 'لا يمكن تسجيل مدفوعات على فاتورة الهالك',
  invoice_has_no_lines: 'أضف سطرًا واحدًا على الأقل',
  line_missing_item: 'اختر الصنف في كل السطور',
  invalid_line_qty: 'الكمية يجب أن تكون أكبر من صفر',
  invalid_line_price: 'السعر غير صحيح',
  invalid_account: 'اختر حسابًا صحيحًا',
  invalid_free_receipt_account: 'لا يمكن استخدام الحساب النقدي في هذا الإيصال الحر',
  invalid_warehouse: 'اختر مخزنًا صحيحًا',
  warehouse_has_stock: 'لا يمكن إيقاف مخزن ما زالت به كميات. صفّر رصيده أولًا.',
  warehouse_has_stock_for_delete: 'لا يمكن حذف المخزن ما دامت به كميات أو تسويات مخزون.',
  primary_location_protected: 'لا يمكن حذف المخزن أو الخزنة الرئيسية.',
  warehouse_not_found: 'المخزن غير موجود أو لا يتبع شركتك.',
  cash_box_not_found: 'الخزنة غير موجودة أو لا تتبع شركتك.',
  warehouse_has_documents: 'لا يمكن حذف المخزن لوجود فواتير مرتبطة به.',
  cash_box_has_documents: 'لا يمكن حذف الخزنة لوجود إيصالات مرتبطة بها.',
  cash_box_has_balance: 'لا يمكن حذف الخزنة لوجود رصيد أو تسويات افتتاحية مرتبطة بها.',
  invalid_transfer_warehouses: 'اختر مخزنين مختلفين ونشطين.',
  invalid_transfer_cash_boxes: 'اختر خزنتين مختلفتين ونشطتين.',
  transfer_has_no_lines: 'أضف صنفًا واحدًا على الأقل للتحويل.',
  invalid_transfer_line: 'راجع أصناف التحويل وكمياتها.',
  warehouse_transfer_not_found: 'التحويل المخزني غير موجود.',
  cash_box_transfer_not_found: 'التحويل بين الخزن غير موجود.',
  transfer_deleted: 'التحويل محذوف بالفعل؛ استعده أولًا قبل تعديله.',
  transfer_not_deleted: 'التحويل غير محذوف.',
  transfer_has_later_movements: 'لا يمكن تعديل أثر التحويل بعد تسجيل حركات لاحقة على نفس الأصناف والمخازن.',
  insufficient_cash_box_balance: 'رصيد خزنة المصدر لا يكفي للتحويل.',
  warehouse_has_transfers: 'لا يمكن حذف المخزن لوجود تحويلات مخزنية مرتبطة به.',
  cash_box_has_transfers: 'لا يمكن حذف الخزنة لوجود تحويلات نقدية مرتبطة بها.',
  invalid_item: 'اختر صنفًا صحيحًا',
  invalid_paid: 'قيمة المدفوع غير صحيحة',
  invalid_kind: 'نوع الفاتورة غير صحيح',
  invoice_not_found: 'الفاتورة غير موجودة',
  invoice_deleted: 'الفاتورة محذوفة، استعِدها أولًا قبل التعديل',
  invoice_already_deleted: 'الفاتورة محذوفة بالفعل',
  invoice_not_deleted: 'الفاتورة غير محذوفة',
  receipt_not_found: 'الإيصال غير موجود',
  receipt_already_deleted: 'الإيصال محذوف بالفعل',
  receipt_not_deleted: 'الإيصال غير محذوف',
  item_not_found: 'الصنف غير موجود',
  account_not_found: 'الحساب غير موجود',
  receipt_linked_immutable:
    'هذا الإيصال مرتبط بفاتورة ولا يمكن تعديله أو حذفه من هنا. عدّل المدفوع من داخل الفاتورة.',
  invalid_amount: 'المبلغ يجب أن يكون أكبر من صفر',
  invalid_cash_box: 'اختر خزنة صحيحة',
  invalid_direction: 'نوع الإيصال غير صحيح',
  account_has_documents:
    'لا يمكن تغيير نوع الحساب لوجود فواتير أو إيصالات مرتبطة به',
  not_authenticated: 'انتهت الجلسة، سجّل الدخول من جديد',
  no_cash_box: 'لا توجد خزنة معرّفة',
  forbidden_company: 'غير مسموح بالوصول لهذه الشركة',
  invalid_statement_period: 'اختر فترة صحيحة لكشف الحساب',
};

export function translateDbError(message: string | undefined | null): string {
  const text = message ?? '';
  for (const key of Object.keys(MESSAGES)) {
    if (text.includes(key)) return MESSAGES[key];
  }
  if (text.includes('Invalid login credentials')) return 'الإيميل أو الباسورد غير صحيح';
  if (text.includes('Email not confirmed')) return 'الإيميل لم يتم تأكيده بعد';
  if (text.includes('Could not find the function')) {
    return 'تعذّر تنفيذ العملية: دالة قاعدة البيانات غير موجودة أو مختلفة. راجع الـmigrations.';
  }
  if (text.includes('items_company_code_ci_idx')) return 'كود الصنف مستخدم بالفعل لدى صنف آخر في شركتك';
  return text || 'حدث خطأ غير متوقع';
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return translateDbError(error.message);
  if (typeof error === 'string') return translateDbError(error);
  return translateDbError((error as { message?: string } | null)?.message);
}
