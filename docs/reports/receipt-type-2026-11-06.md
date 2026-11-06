# اختصار نوع الإيصال وتوزيع المساحة — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

- نوع الإيصال يظهر «مرتبط» أو «حر» فقط في الجدول وفلتر النوع.
- المرتبط بالرصاصي، والحر بالأزرق المميز.
- عمود النوع ثابت تقريبًا على ٨٠ بكسل، ولا يتمدد مع الشاشة الواسعة.
- الأعمدة القصيرة تستخدم عرض محتواها، والمساحة المتبقية تذهب للبيان والملاحظات.
- الحد الأدنى لكل من البيان والملاحظات ارتفع من ٨٠ إلى ٩٦ بكسل، مع التفاف النصوص.

القياس: النوع المرتبط كان يحتاج نحو ١١٧ بكسل عند ١٢٨٠، ويصل إلى نحو ١٦٩ عند ١٩٢٠. أصبح ٨٠ في المقاسات المختبرة. في المثال عند ١٩٢٠ أصبح البيان نحو ٢٨٨ بكسل والملاحظات نحو ٥٣٩، بدل نحو ١٣٢ و٢٦١ قبل إعادة التوزيع.

| الملف | السبب |
| --- | --- |
| [src/lib/format.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/format.ts) | توحيد مسميات نوع الإيصال المختصرة. |
| [src/lib/columnFilters.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/columnFilters.ts) | نفس المسميات في فلتر النوع، مع بقاء قيم البحث كما هي. |
| [src/pages/receipts/ReceiptTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/receipts/ReceiptTable.tsx) | إظهار حر ومرتبط وتحديد عمود النوع المشترك للاستلام والصرف. |
| [src/styles/components/badges.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/badges.css) | المرتبط رمادي والحر أزرق. |
| [src/styles/components/tables.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | عمود نوع مضغوط، والمساحة الزائدة لعمودي البيان والملاحظات. |
| [src/test/components/DocumentLists.test.tsx](D:/Work/Coding/AI/MaksabPlus/src/test/components/DocumentLists.test.tsx) | اختبار المسميات المختصرة والشارات في الجدول. |
| [src/test/columnFilters.test.ts](D:/Work/Coding/AI/MaksabPlus/src/test/columnFilters.test.ts) | اختبار مسميات خيارات الفلتر مع ثبات قيمها. |
| [scripts/verify-column-filters.mjs](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | اختبار الألوان وعرض النوع والتصفية وعدم التمرير في الشاشتين. |
| الصور أدناه | معاينات القوائم والإيصالات الحرة والمرتبطة ذات المبالغ الكبيرة. |
| هذا التقرير | توثيق التغييرات والقياس والاختبارات. |

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| npx tsc --noEmit | نجاح، صفر أخطاء. |
| npx eslint src | نجاح، صفر أخطاء وصفر تحذيرات. |
| npx vitest run | نجاح ١٧٦ اختبارًا في ٣٣ ملفًا. |
| node supabase/tests/run-local.mjs | لم يُشغل؛ لا يوجد تعديل بقاعدة البيانات. |
| npx vite build | نجاح، ٢٠٧٤ وحدة. |

نجح فحص ٢٤ مسارًا بثلاثة مقاسات، و٤٦ حالة بدون نتائج. فحص المتصفح تحقق من لون الحر والمرتبط، وعرض عمود النوع، واختيار «مرتبط» من الفلتر وإرسال نفس قيمة التصفية السابقة. نجحت أيضًا ٦ معاينات لإيصالات مرتبطة بمبالغ كبيرة وملاحظات طويلة في الاستلام والصرف، دون تمرير أفقي زائد على المقاسات المختبرة.

## ٣. قائمة الأمان

لا تغيير في قاعدة البيانات أو الصلاحيات أو طريقة حفظ الإيصالات والمبالغ. معنى الإيصال وعلاقته بالمستند لم يتغيرا؛ التغيير في العرض فقط. مسميات الواجهة مستقلة عن قيم التصفية الثابتة، ولا تحتاج إلى ترحيل قاعدة بيانات.

## ٤. ما لم أختبره وما بقي غير مؤكد

لم أختبر الهاتف أو محركات متصفح أخرى. المعاينات ببيانات صناعية، ولم أكتب بيانات فعلية على الإنتاج.

## ٥. الافتراضات

- اللون المميز للحر هو الأزرق المستخدم بالفعل في النظام.
- اختصار الوصف يخص عمود النوع وفلتره؛ تفاصيل المستند المرتبط تبقى متاحة في عرض الإيصال.
- المساحة المتبقية توزع تلقائيًا على البيان والملاحظات حسب المحتوى، مع الحفاظ على الأرقام كاملة.

## ٦. قواعد تعذر الالتزام بها

لا توجد ضمن النطاق. فحص قاعدة البيانات غير مطلوب لعدم تعديلها.

## ٧. التجربة اليدوية

1. حدّث إيصالات الاستلام والصرف، وراجع النوع المختصر ولونه.
2. افتح فلتر نوع الإيصال، واختر حر أو مرتبط ثم امسح الاختيار.
3. راجع ثبات عرض النوع والمساحة الأكبر للبيان والملاحظات.
4. جرّب إيصالًا مرتبطًا بمبلغ كبير وملاحظات طويلة، ثم حالة بحث بدون نتائج.

## صور كل الشاشات


| الشاشة | ١٢٨٠ | ١٩٢٠ |
| --- | --- | --- |
| فواتير المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-sale-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-sale-1920px.png) |
| فواتير المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-purchase-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-purchase-1920px.png) |
| مرتجعات المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-sale_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-sale_return-1920px.png) |
| مرتجعات المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-purchase_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-purchase_return-1920px.png) |
| الهالك | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-waste-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-waste-1920px.png) |
| تحويلات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-warehouse_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-invoices-warehouse_transfer-1920px.png) |
| إيصالات الاستلام | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-receipts-in-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-receipts-in-1920px.png) |
| إيصالات الصرف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-receipts-out-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-receipts-out-1920px.png) |
| تحويلات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-receipts-cash_box_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-receipts-cash_box_transfer-1920px.png) |
| بيانات العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-customers-1920px.png) |
| بيانات الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-suppliers-1920px.png) |
| بيانات الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-items-1920px.png) |
| بيانات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-warehouses-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-warehouses-1920px.png) |
| بيانات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-data-cashBoxes-1920px.png) |
| أرصدة العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-customers-1920px.png) |
| أرصدة الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-suppliers-1920px.png) |
| أرصدة الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-items-1920px.png) |
| أرصدة الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-balances-cashBoxes-1920px.png) |
| افتتاحي العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-customers-1920px.png) |
| افتتاحي الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-suppliers-1920px.png) |
| افتتاحي الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-items-1920px.png) |
| افتتاحي الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-cashBoxes-1920px.png) |
| سجل الفحص | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-reconciliations-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-reconciliations-1920px.png) |
| المستخدمون | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-users-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-management-users-1920px.png) |


[بحث بدون نتائج — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-empty-sales-1280px.png)

[إيصال الاستلام مرتبط — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-stress-in-1280px.png)

[إيصال الصرف مرتبط — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-stress-out-1280px.png)

[بحث بدون نتائج — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-empty-sales-1920px.png)

[إيصال الاستلام مرتبط — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-stress-in-1920px.png)

[إيصال الصرف مرتبط — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-type-stress-out-1920px.png)
