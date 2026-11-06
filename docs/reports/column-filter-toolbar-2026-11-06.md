# تبسيط شريط الفلاتر وتوحيد المحاذاة — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

- رجع سهم القوائم القابلة للبحث داخل مساحة الخانة الحالية، دون فرض عرض إضافي.
- محاذاة رؤوس الأعمدة وخلاياها لليمين، بما فيها الوقت والتاريخ ونوع الحساب والحالة. حقول صف البحث أيضًا تتبع محاذاة خلاياها.
- شريط الفواتير والمرتجعات والهالك والتحويلات والسندات وسجل الفحص أصبح للفترة والتاريخ فقط.
- الليبل على يمين الحقل بدل أعلاه، ويشمل نفس مكوّن الفترة في كشوف الحساب.
- معايير السداد والحساب والخزنة والمنشئ وغيرها تظل في صف البحث الجديد. أُزيلت حالة البحث والفلاتر العلوية القديمة من الكود حتى لا يبقى شرط مخفي في الطلبات.

| الملف | السبب |
| --- | --- |
| [src/components/ColumnFilterRow.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/ColumnFilterRow.tsx) | إرجاع سهم القوائم القابلة للبحث. |
| [src/pages/Invoices.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/Invoices.tsx) | إزالة البحث وحالة السداد العلويين وحالتهما القديمة من الطلبات. |
| [src/pages/Receipts.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/Receipts.tsx) | الاكتفاء بالفترة والتاريخ فوق السندات والتحويلات، مع البحث والخزن في صف الأعمدة. |
| [src/pages/management/ReconciliationLogTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/management/ReconciliationLogTab.tsx) | الفترة والتاريخ فقط فوق سجل الحركات، وباقي المعايير في الأعمدة. |
| [src/styles/components/tables.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | محاذاة الأعمدة والحقول لليمين وسهم مضغوط دون زيادة العرض. |
| [src/styles/pages/erp-workspace.css](D:/Work/Coding/AI/MaksabPlus/src/styles/pages/erp-workspace.css) | الليبل على يمين الفترة والتاريخ، مع توحيد نفس المكون في كشوف الحساب. |
| [src/test/components/ColumnFilterRow.test.tsx](D:/Work/Coding/AI/MaksabPlus/src/test/components/ColumnFilterRow.test.tsx) | اختبار ظهور السهم مع استمرار البحث والمسح. |
| [scripts/verify-column-filters.mjs](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | اختبارات محاذاة الأعمدة والليبلات وتبسيط الشريط وثبات العرض. |
| الصور أدناه | ٥٠ معاينة للقوائم وحالة عدم وجود نتائج، و٦ معاينات لكشوف الحساب. |
| هذا التقرير | النطاق ونتائج التحقق والتجربة اليدوية. |

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| npx tsc --noEmit | نجاح، صفر أخطاء. |
| npx eslint src | نجاح، صفر أخطاء وصفر تحذيرات. |
| npx vitest run | نجاح ١٧٥ اختبارًا في ٣٣ ملفًا. |
| node supabase/tests/run-local.mjs | لم يُشغل؛ لا يوجد تعديل بقاعدة البيانات. |
| npx vite build | نجاح، ٢٠٧٤ وحدة. |

فحص ٢٤ مسارًا بثلاثة مقاسات نجح. تحقق من محاذاة كل عمود، ومن وجود ثلاث ليبلات يمين الحقول على نفس الارتفاع، وأن الشريط يحتوي على اختيار الفترة فقط مع حقلي التاريخ، دون البحث أو الحالة القديمين.

نجحت ٤٦ حالة بدون نتائج، و٨ معاينات للموظف، وفحوص تطابق بحث الصفوف والإجماليات للقوائم الشقيقة والمسح واختيار المنشئ. نجح فحص ٦ نوافذ لكشوف حساب العميل والخزنة والصنف عند ١٢٨٠ و١٩٢٠.

## ٣. قائمة الأمان

لا تغيير في دوال أو سياسات أو جداول قاعدة البيانات، ولا في حفظ الأموال والمخزون أو الصلاحيات. قراءة المؤشرات والنتائج تستخدم نفس معايير الأعمدة والفترة.

## ٤. ما لم أختبره وما بقي غير مؤكد

لم أختبر الهاتف أو محركات متصفح أخرى، ولم أكتب بيانات فعلية على الإنتاج. المعاينات والاختبارات التفاعلية ببيانات صناعية.

## ٥. الافتراضات

- تبسيط الشريط يخص قوائم المستندات والحركات التي تحتوي بالفعل على فترة وتاريخ. لم تُضف فترة إلى شاشات البيانات الثابتة.
- اتجاه ومحاذاة الأعمدة لليمين؛ تبقى الأرقام والتاريخ والوقت معزولة باتجاه قراءة سليم داخل الخلايا.
- البحث والحالات المنقولة متاحة من صف الأعمدة، والفلاتر القديمة المحذوفة لا تبقى فعالة في الخلفية.
- عروض الأعمدة الأصلية وحدود الجدول تستمر؛ السهم لا يضيف عرضًا.

## ٦. قواعد تعذر الالتزام بها

لا توجد ضمن نطاق المهمة. فحص قاعدة البيانات غير مطلوب لأنها لم تتغير.

## ٧. التجربة اليدوية

1. حدّث المبيعات؛ فوق الجدول يظهر فقط الفترة ومن وإلى، والليبلات على يمين حقولها.
2. افتح سهم المخزن والحالة والمنشئ في صف البحث، واختر القيم وتأكد من تصفية الصفوف والمؤشرات.
3. راجع محاذاة الوقت والحالة وباقي الأعمدة، وجرّب كتابة رقم أو وقت.
4. اختَر فترة مختلفة ثم امسح الفلاتر؛ تعود الفترة الافتراضية وتختفي معايير الأعمدة.
5. ابحث برقم غير موجود؛ الأعمدة تظل ثابتة ولا يزيد التمرير.
6. كرر في السندات والتحويلات، وافتح كشف حساب لمراجعة الليبلات المشتركة.

## صور كل الشاشات


| الشاشة | ١٢٨٠ | ١٩٢٠ |
| --- | --- | --- |
| فواتير المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-sale-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-sale-1920px.png) |
| فواتير المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-purchase-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-purchase-1920px.png) |
| مرتجعات المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-sale_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-sale_return-1920px.png) |
| مرتجعات المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-purchase_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-purchase_return-1920px.png) |
| الهالك | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-waste-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-waste-1920px.png) |
| تحويلات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-warehouse_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-invoices-warehouse_transfer-1920px.png) |
| إيصالات الاستلام | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-receipts-in-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-receipts-in-1920px.png) |
| إيصالات الصرف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-receipts-out-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-receipts-out-1920px.png) |
| تحويلات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-receipts-cash_box_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-receipts-cash_box_transfer-1920px.png) |
| بيانات العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-customers-1920px.png) |
| بيانات الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-suppliers-1920px.png) |
| بيانات الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-items-1920px.png) |
| بيانات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-warehouses-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-warehouses-1920px.png) |
| بيانات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-data-cashBoxes-1920px.png) |
| أرصدة العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-customers-1920px.png) |
| أرصدة الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-suppliers-1920px.png) |
| أرصدة الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-items-1920px.png) |
| أرصدة الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-balances-cashBoxes-1920px.png) |
| افتتاحي العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-customers-1920px.png) |
| افتتاحي الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-suppliers-1920px.png) |
| افتتاحي الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-items-1920px.png) |
| افتتاحي الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-cashBoxes-1920px.png) |
| سجل الفحص | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-reconciliations-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-reconciliations-1920px.png) |
| المستخدمون | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-users-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-management-users-1920px.png) |


## صور إضافية

[مبيعات بدون نتائج — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-empty-sales-1280px.png)

[كشف العميل — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-statement-customers-1280px.png)

[كشف الخزنة — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-statement-cashBoxes-1280px.png)

[كشف الصنف — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-statement-items-1280px.png)

[مبيعات بدون نتائج — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-empty-sales-1920px.png)

[كشف العميل — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-statement-customers-1920px.png)

[كشف الخزنة — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-statement-cashBoxes-1920px.png)

[كشف الصنف — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-toolbar-statement-items-1920px.png)
