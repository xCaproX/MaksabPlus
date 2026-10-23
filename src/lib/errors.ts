const MESSAGES: Record<string, string> = {
  paid_exceeds_total: 'المدفوع أكبر من إجمالي الفاتورة',
  invoice_has_no_lines: 'أضف سطرًا واحدًا على الأقل',
  line_missing_item: 'اختر الصنف في كل السطور',
  invalid_line_qty: 'الكمية يجب أن تكون أكبر من صفر',
  invalid_line_price: 'السعر غير صحيح',
  invalid_account: 'اختر حسابًا صحيحًا',
  account_kind_mismatch: 'نوع الحساب لا يناسب نوع الفاتورة',
  invalid_warehouse: 'اختر مخزنًا صحيحًا',
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
  return text || 'حدث خطأ غير متوقع';
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return translateDbError(error.message);
  if (typeof error === 'string') return translateDbError(error);
  return translateDbError((error as { message?: string } | null)?.message);
}
