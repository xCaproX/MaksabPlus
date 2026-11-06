# توحيد عرض التاريخ والوقت وتوسيع الخزنة — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

تم توسيع عمود الخزنة في الإيصالات إلى ١٢٤ بكسل لظهور «الخزنة الرئيسية» في سطر واحد، مع التأكد من ظهور الاسم كاملًا في اختيار البحث بعد حساب مساحة السهم.

عرض عمود التاريخ أصبح ١١٢ بكسل، والوقت ٨٤ بكسل، من تعريف مشترك في المشروع. يشمل الفواتير والمرتجعات والهالك والإيصالات والتحويلات وكشوف الحساب. عمود التاريخ والوقت المركب في سجل الفحص يستخدم مجموعهما ١٩٦ بكسل.

خانات البحث داخل هذه الأعمدة تتبع نفس المساحة الداخلية في الشاشات المختلفة. تستمر العروض الثابتة عند التحميل وعدم وجود نتائج وتغيير حجم الشاشة. البيان والملاحظات يلتفان حسب المساحة الباقية على الشاشات الضيقة، مع الحفاظ على الأرقام.

| الملف | السبب |
| --- | --- |
| [src/styles/tokens.css](D:/Work/Coding/AI/MaksabPlus/src/styles/tokens.css) | مصدر موحد لعرض التاريخ ١١٢ والوقت ٨٤ بكسل. |
| [src/styles/components/tables.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | الخزنة ١٢٤ بكسل، أعمدة التاريخ والوقت ثابتة، والنصوص تتكيف مع المساحة. |
| [src/lib/columnFilters.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/columnFilters.ts) | تطبيق أصناف العرض الموحدة على خانات التاريخ والوقت والتوقيت المركب. |
| [src/lib/useStableTableColumns.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/useStableTableColumns.ts) | حفظ الأعمدة الثابتة بالبكسل، وتكييف النصوص عند غياب النتائج وتغيير حجم الشاشة. |
| [src/pages/invoices/InvoiceTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/invoices/InvoiceTable.tsx) | ربط رأس تاريخ الفاتورة بالتنسيق المشترك. |
| [src/pages/invoices/WarehouseTransferTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/invoices/WarehouseTransferTable.tsx) | نفس العرض لتاريخ تحويل المخازن. |
| [src/pages/receipts/CashBoxTransferTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/receipts/CashBoxTransferTable.tsx) | نفس العرض لتاريخ تحويل الخزن. |
| [src/pages/management/ReconciliationLogTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/management/ReconciliationLogTab.tsx) | توحيد عمود التوقيت المركب مع مجموع عرضي التاريخ والوقت. |
| [src/pages/balances/AccountBalancesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/balances/AccountBalancesTab.tsx) | عرض التاريخ نفسه داخل كشف حساب العميل والمورد. |
| [src/pages/balances/CashBoxBalancesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/balances/CashBoxBalancesTab.tsx) | عرض التاريخ نفسه داخل كشف الخزنة. |
| [src/pages/balances/ItemBalancesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/balances/ItemBalancesTab.tsx) | عرض التاريخ نفسه داخل كشف حركة الصنف. |
| [scripts/verify-column-filters.mjs](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | قياس المقاسات وظهور اسم الخزنة كاملًا، واختبار تغيير الحجم في الحالة الفارغة. |
| الصور أدناه | معاينات القوائم والكشوف والحالات الفارغة والمبالغ الكبيرة. |
| هذا التقرير | التغييرات والاختبارات والحدود والتجربة اليدوية. |

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| npx tsc --noEmit | نجاح، صفر أخطاء. |
| npx eslint src | نجاح، صفر أخطاء وصفر تحذيرات. |
| npx vitest run | نجاح ١٧٦ اختبارًا في ٣٣ ملفًا. |
| node supabase/tests/run-local.mjs | لم يُشغل؛ لا يوجد تعديل بقاعدة البيانات. |
| npx vite build | نجاح، ٢٠٧٤ وحدة. |

نجحت معاينة ٢٤ مسارًا بثلاثة مقاسات، مع قياس التاريخ والوقت والتحقق من ظهور اسم الخزنة في سطر واحد وفي حقل البحث دون قص. نجحت ٤٦ حالة بدون نتائج و٢٤ تجربة لتغيير حجم الجدول الفارغ، مع الحفاظ على عرض الأعمدة الثابتة.

نجحت ٦ نوافذ لكشوف حساب العميل والخزنة والصنف بصفوف تجريبية معروضة؛ عرض التاريخ في الرأس والصفوف ١١٢ بكسل. نجحت ٨ معاينات لإيصالات مرتبطة بمبالغ كبيرة وملاحظات طويلة، عند ١٢٨٠ و١٣٢٠ و١٣٦٦ و١٩٢٠.

## ٣. قائمة الأمان

لا تعديل في قاعدة البيانات أو الصلاحيات أو حساب المبالغ والمخزون أو حفظ المستندات. التعديل في توزيع الأعمدة والحقول فقط.

## ٤. ما لم أختبره وما بقي غير مؤكد

لم أختبر الهاتف أو محركات متصفح أخرى، ولم أكتب بيانات فعلية على الإنتاج. البيانات المستخدمة في الاختبارات والصور صناعية.

## ٥. الافتراضات

- العرض الموحد يخص أعمدة التاريخ والوقت وخانات البحث داخل الجداول؛ حقول إدخال المستندات تحتفظ بتخطيط نماذجها.
- عرض العمود يشمل حواف الخلية؛ عرض حقل البحث الداخلي متطابق بين الجداول بعد خصم نفس الهوامش.
- التاريخ والوقت يبقيان باتجاه قراءة سليم مع محاذاة الخلية لليمين.
- المساحة المتاحة للبيان والملاحظات تتكيف مع الشاشة، دون إخفاء النص أو تقليل أعمدة الأرقام.

## ٦. قواعد تعذر الالتزام بها

لا توجد ضمن نطاق المهمة. فحص قاعدة البيانات غير مطلوب لأنها لم تتغير.

## ٧. التجربة اليدوية

1. حدّث إيصالات الاستلام والصرف، وتأكد أن «الخزنة الرئيسية» تظهر على سطر واحد.
2. اختَر الخزنة من صف البحث، وتأكد أن الاسم لا يصطدم بالسهم.
3. تنقل بين الفواتير والإيصالات والتحويلات وراجع ثبات عرض التاريخ والوقت.
4. ابحث برقم غير موجود ثم غيّر حجم النافذة؛ الأعمدة الثابتة تحافظ على عرضها.
5. افتح كشوف حساب العميل والخزنة والصنف، واعرض الكشف لمراجعة عمود التاريخ.

## صور كل الشاشات


| الشاشة | ١٢٨٠ | ١٩٢٠ |
| --- | --- | --- |
| فواتير المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-sale-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-sale-1920px.png) |
| فواتير المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-purchase-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-purchase-1920px.png) |
| مرتجعات المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-sale_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-sale_return-1920px.png) |
| مرتجعات المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-purchase_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-purchase_return-1920px.png) |
| الهالك | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-waste-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-waste-1920px.png) |
| تحويلات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-warehouse_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-invoices-warehouse_transfer-1920px.png) |
| إيصالات الاستلام | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-receipts-in-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-receipts-in-1920px.png) |
| إيصالات الصرف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-receipts-out-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-receipts-out-1920px.png) |
| تحويلات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-receipts-cash_box_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-receipts-cash_box_transfer-1920px.png) |
| بيانات العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-customers-1920px.png) |
| بيانات الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-suppliers-1920px.png) |
| بيانات الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-items-1920px.png) |
| بيانات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-warehouses-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-warehouses-1920px.png) |
| بيانات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-data-cashBoxes-1920px.png) |
| أرصدة العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-customers-1920px.png) |
| أرصدة الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-suppliers-1920px.png) |
| أرصدة الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-items-1920px.png) |
| أرصدة الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-balances-cashBoxes-1920px.png) |
| افتتاحي العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-customers-1920px.png) |
| افتتاحي الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-suppliers-1920px.png) |
| افتتاحي الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-items-1920px.png) |
| افتتاحي الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-cashBoxes-1920px.png) |
| سجل الفحص | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-reconciliations-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-reconciliations-1920px.png) |
| المستخدمون | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-users-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-management-users-1920px.png) |


[بدون نتائج — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-empty-sales-1280px.png)

[كشف العميل — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-statement-customers-1280px.png)

[كشف الخزنة — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-statement-cashBoxes-1280px.png)

[كشف الصنف — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-statement-items-1280px.png)

[بدون نتائج — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-empty-sales-1920px.png)

[كشف العميل — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-statement-customers-1920px.png)

[كشف الخزنة — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-statement-cashBoxes-1920px.png)

[كشف الصنف — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-statement-items-1920px.png)

[إيصال استلام مرتبط — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-stress-in-1280px.png)

[إيصال صرف مرتبط — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-stress-out-1280px.png)

[إيصال استلام مرتبط — 1320](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-stress-in-1320px.png)

[إيصال صرف مرتبط — 1320](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-stress-out-1320px.png)

[إيصال استلام مرتبط — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-stress-in-1920px.png)

[إيصال صرف مرتبط — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/fixed-date-cash-stress-out-1920px.png)
