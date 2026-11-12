# 3. منطق الأعمال والمحاسبة (Business & Accounting Logic)

منطق الأعمال في **مكسب بلس** مُصمم بحيث تُنفذ جميع العمليات المالية والمخزنية داخل **معاملات ذرية (Atomic PostgreSQL Transactions)**. لا تُحتسب الأرصدة أو التكاليف النهائية على جهة العميل (Frontend) إطلاقاً، بل يُعاد حساب كل شيء وتثبيته في قاعدة البيانات.

---

## القواعد المحاسبية للأرصدة (Balance & Direction Rules)

### 1. إشارات الأرصدة وتصنيفها
- **العميل (`customer`)**:
  - رصيد موجب (`current_balance > 0`): "عليه" (مدين للشركة).
  - رصيد سالب (`current_balance < 0`): "له" (دائن - دفعة مقدمة).
  - رصيد صفري: "خالص".
- **المورد (`supplier`)**:
  - رصيد موجب (`current_balance > 0`): "له" (دائن - مستحق للمورد).
  - رصيد سالب (`current_balance < 0`): "عليه" (مدين - دفعة مقدمة للمورد).
  - رصيد صفري: "خالص".
- **الخزنة النقدية (`cash_boxes`)**:
  - الرصيد (`current_balance`) يمثل صافي النقدية المتوفرة (`effective_opening_balance + total_in - total_out + transfers_net`).
  - **منع السحب على المكشوف (`insufficient_cash_box_balance`)**: يُرفض أي صرف أو تعديل أو حذف فاتورة أو تعديل/حذف تحويل نقدي أو حفظ أرصدة افتتاحية يؤدي إلى نزول رصيد الخزنة تحت الصفر (هجرتا `0078` و`0079`).
- **المقاصة والتداول المتبادل (Cross-Trading Balances - هجرتا `0070` و`0078`)**:
  - يدعم النظام البيع لمورد أو الشراء من عميل؛ تتبع دالة `sync_account_balance` و`calculate_expected_account_balance` وكشف الحساب قاعدة موحدة:
    - للعميل: الرصيد = الافتتاحي + (المبيعات + مرتجع المشتريات) − (المشتريات + مرتجع المبيعات) − (صافي الإيصالات الحرة والمرتبطة).
    - للمورد: الرصيد = الافتتاحي + (المشتريات + مرتجع المبيعات) − (المبيعات + مرتجع المشتريات) − (صافي الإيصالات الحرة والمرتبطة).

---

## دورة حياة المستندات والترحيل (Document Posting Lifecycles)

### 1. فواتير البيع (`sale`)
عند استدعاء دالة `create_invoice` بنوع `sale`:
1. **التحقق من المخزون**: التحقق من توفر الكمية المطلوبة في `item_stock` للمخزن المحدد (`insufficient_stock` عند العجز).
2. **ترتيب الأقفال وتحديث المخزون**:
   - تُعالج بنود الفاتورة بترتيب `item_id` تصاعدياً لمنع تعارض الأقفال التزامني (`Deadlock 40P01`).
   - خصم الكمية من `item_stock.qty` في المخزن المحدد عبر `apply_stock_movement`.
3. **تثبيت التكلفة وحساب الربح**:
   - قراءة متوسط التكلفة الحالي من `item_stock.avg_cost` وتثبيته في `invoice_items.unit_cost`.
   - حساب `cost_total` و `profit_total` وتخزينهما في `invoices` عبر `recalc_invoice_totals`.
4. **تسجيل المدفوع والآجل**:
   - إذا كانت قيمة `paid > 0`: تُنشأ أو تُحدث دالة `sync_invoice_receipt` سند قبض مرتبطاً (`direction = 'in'`, `invoice_id` محدد) وتزيد `cash_boxes.current_balance`.
   - يُحدث رصيد الحساب في `accounts.current_balance` تلقائياً بالمتبقي.

### 2. فواتير الشراء (`purchase`)
عند استدعاء `create_invoice` بنوع `purchase`:
1. **إضافة المخزون**: زيادة `item_stock.qty` في المخزن المحدد بترتيب تصاعدي لـ `item_id`.
2. **إعادة احتساب تكلفة الصنف بالمتوسط المرجح (Moving Average Cost)**:
   - المعادلة المطبقة في `apply_stock_movement` عندما `qty + p_qty_delta > 0`:
     $$\text{New Avg Cost} = \text{round}\left(\frac{(\text{Old Qty} \times \text{Old Avg Cost}) + (\text{Incoming Qty} \times \text{Unit Cost})}{\text{Old Qty} + \text{Incoming Qty}}, 4\right)$$
   - يُخزن الناتج في `item_stock.avg_cost` لكل مخزن على حدة.
   - **حماية التكلفة من التعديل بأثر رجعي (`purchase_invoice_has_later_outflow`)**: تمنع `0078` و`0079` و`0081` و`0082` تعديل أو استعادة أو حذف فاتورة شراء (أو إرجاع تاريخها للوراء) إذا وُجدت بعدها حركات خروج لأي من أصنافها من نفس المخزن (`sale`, `waste`, `purchase_return`, أو `warehouse_transfers`) سواء بتاريخ لاحق أو بوقت إنشاء فعلي لاحق (`created_at > pinv.created_at`)، إلا للتعديلات الآمنة المحددة مع استدعاء `sync_invoice_receipt` دائماً. وفي `0082` يعالج مسار التعديل بالصافي (`update_invoice`) إضافة وحذف الأصناف عبر `FULL OUTER JOIN` مع تمرير تكلفة الوحدة المحذوفة ومعالجة كسور التقريب العشرية في `apply_stock_movement`.
3. **المدفوعات والمستحقات**:
   - إذا كان `paid > 0`: يتحقق `sync_invoice_receipt` من كفاية رصيد الخزنة (`insufficient_cash_box_balance`) وينشئ سند صرف مرتبطاً (`direction = 'out'`).

### 3. فواتير المرتجعات (`sale_return`, `purchase_return`)
- **مرتجع البيع (`sale_return`)**: يعيد البضاعة إلى `item_stock` ويخصم قيمتها من رصيد العميل؛ وإذا سُجّل مسترد نقدي (`paid > 0`) ينشئ سند صرف مرتبطاً مع التحقق من كفاية رصيد الخزنة.
- **مرتجع الشراء (`purchase_return`)**: يخرج البضاعة من `item_stock` ويخصم قيمتها من رصيد المورد؛ وإذا سُجّل استرداد نقدي ينشئ سند قبض مرتبطاً. ويُحسب كحركة خروج لاحقة في `purchase_invoice_has_later_outflow`.

### 4. فواتير الهالك والإتلاف (`waste`)
- تخصم البضاعة من `item_stock.qty` بسعر سطر `0` إلزامياً (`waste_price_must_be_zero`).
- تسجل تكلفة الإتلاف كخسارة (`cost_total` و `profit_total = -cost_total`).
- ترتبط بحساب النظام الثابت للـ `waste` ولا تؤثر على حساب عميل أو مورد.

### 5. سندات القبض والصرف (`receipts`)
- **سند حر (`invoice_id IS NULL`)**: سداد أو قبض مباشر عبر `create_free_receipt` / `update_free_receipt` / `delete_free_receipt` / `restore_receipt`، ويُقفل الحساب والخزنة لمنع السحب على المكشوف أو تضارب الأقفال.
- **سند مرتبط (`invoice_id IS NOT NULL`)**: يُدار حصرياً عبر `sync_invoice_receipt` داخل معاملات الفواتير ويُحظر تعديله أو حذفه مباشرة.

### 6. التحويلات الداخلية والأرصدة الافتتاحية واستعادة المستندات
- **تحويل مخزني (`warehouse_transfers`)**: يخصم من `source_warehouse_id` ويزيد `destination_warehouse_id` في معاملة واحدة مع نقل التكلفة الفعلية، ويُمنع تعديله أو حذفه إذا تلاه تحويل أو فاتورة أو تسوية أو رصيد افتتاحي أحدث (`warehouse_transfer_has_later_movement` في `0083`).
- **تحويل نقدية (`cash_box_transfers`)**: يخصم من `source_cash_box_id` (بعد التحقق من الرصيد ومنع السالب حتى عند التعديل أو الحذف) ويودع في `destination_cash_box_id` مع قفل الخزنتين بترتيب `id` التصاعدي.
- **استعادة الفواتير (`restore_invoice` - هجرة `0083`)**: تتطلب أن يكون الحساب والمخزن وجميع أصناف الفاتورة نشطة (`is_active = true`).
- **الأرصدة الافتتاحية الذرية**:
  - `save_account_opening_balances`: حفظ افتتاحيات العملاء والموردين في معاملة ذرية واحدة (`0080`).
  - `save_opening_balances`: حفظ افتتاحيات الخزن والمخزون مع منع الرصيد الافتتاحي السالب للخزن (`0083` عند الإنشاء والافتتاحي)، ومنع كسر رصيد الخزنة للسالب، وتحديث `item_stock.avg_cost` إذا لم تكن هناك حركات على الصنف مع عدم مسح `avg_cost` القائم عند حفظ كمية صفرية لمخزن فرعي (`0079`, `0082`).

---

## التوقيت المحلي، ترتيب الأقفال، ومحرك المطابقة

1. **توقيت القاهرة الموحد (`cairo_today()` و`Africa/Cairo`)**:
   - تعتمد الجداول والـ RPCs تاريخ مصر (`Africa/Cairo`) عند غياب التاريخ، وتُستبعد المستندات ذات التواريخ المستقبلية من إحصائيات اليوم في لوحة التحكم (`0076`, `0078`, `0081`)، كما تشمل `get_home_dashboard_summary` أرصدة الخزن والحسابات المعطلة ذات الأرصدة غير الصفرية (`0083`).
   - تُحوّل تواريخ تسويات الأرصدة الافتتاحية داخل كشوف الحساب والخزن وحركة الصنف إلى `(created_at at time zone 'Africa/Cairo')::date` (`0083`).
2. **ترتيب الأقفال الموحد (Lock Ordering)**:
   - تلتزم دوال الفواتير (`update_invoice`, `delete_invoice`, `restore_invoice`) بترتيب أقفال ثابت: `invoices -> accounts (ordered by id) -> item_stock (ordered by warehouse_id, item_id) -> receipts -> cash_boxes` لمنع حدوث `Deadlock` في المعاملات المتزامنة (`0077`, `0080`, `0081`, `0083`).
3. **محرك المطابقة والرقابة (`run_comprehensive_reconciliation`, `reconcile_all_balances`, `reconcile_item_stock`)**:
   - يحسب الأرصدة المتوقعة عبر `calculate_expected_account_balance` و`calculate_expected_cash_box_balance` ومراجعة حركات المخزون (شاملاً الأصناف والمخازن الموقوفة ذات الأرصدة أو الحركات السابقة في كل من `reconcile_item_stock_internal` و`run_comprehensive_reconciliation` مع قفل مسبق بترتيب `accounts -> item_stock -> cash_boxes` في وضع التصحيح منذ `0083`).
   - وضع المحاكاة (`simulation`) يعرض الفروقات دون تعديل، ووضع التصحيح (`reconcile`) يعيد المزامنة ويسجل النتيجة في `balance_reconciliation_logs` (مقصور على المالك).
