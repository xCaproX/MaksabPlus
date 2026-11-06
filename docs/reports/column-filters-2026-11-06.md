# تقرير تجربة البحث داخل أعمدة القوائم — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

أُضيف صف بحث تحت رأس الجدول مباشرة في ٢٣ شاشة قائمة. المستخدمون يستخدمون نفس المكون في شريط ملائم للبطاقات. شريط الفلاتر العلوي كما هو، ومعاييره تعمل مع معايير الأعمدة معًا. المبالغ تُطابق بالمساواة الدقيقة وتشمل الصفر. الحساب يُبحث بالاسم أو الهاتف، والخيارات قابلة للبحث.

زر المسح في آخر الصف يمسح بحث الأعمدة والشريط العلوي، يعيد الصفحة الأولى وفترة النهاردة والمستندات غير المحذوفة، ويحتفظ بالترتيب. افتتاحي المخزون يعود إلى المخزن الرئيسي أو أول مخزن متاح.

نقطة الرجوع محفوظة ومرفوعة قبل التجربة:

checkpoint/before-column-filters-2026-11-06

تشير إلى النسخة 560f987fbbb495e678a182b9b2e35f3ffa1cd859. دوال المؤشرات القديمة متوافقة مع الترحيل الجديد، لذلك استعادة الكود القديم لا تتطلب حذف بيانات.

| الملف | سبب التعديل |
| --- | --- |
| [src/components/ColumnFilterRow.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/ColumnFilterRow.tsx) | صف البحث والقوائم القابلة للبحث وزر المسح الموحد. |
| [src/lib/listColumnSchema.json](D:/Work/Coding/AI/MaksabPlus/src/lib/listColumnSchema.json) | تعريف مركزي لأعمدة ١٦ نوعًا من القوائم. |
| [src/lib/columnFilters.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/columnFilters.ts) | مطابقة القيم وتحميل أسماء المنشئين. |
| [src/lib/useColumnFilters.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/useColumnFilters.ts) | تأخير البحث والمسح الفوري وعزل حالة كل قائمة. |
| [src/components/DateInput.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/DateInput.tsx) | إفراغ التاريخ ورفض الأيام غير الموجودة في الشهر. |
| [src/lib/format.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/format.ts) | عرض تاريخ التوقيت المسجل بتوقيت القاهرة. |
| [src/pages/Invoices.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/Invoices.tsx) | ربط بحث الفواتير والتحويلات بالنتائج والإجماليات. |
| [src/pages/Receipts.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/Receipts.tsx) | ربط بحث السندات والتحويلات بالنتائج والإجماليات. |
| [src/components/UserPermissions.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/UserPermissions.tsx) | عرض نفس البحث بما يناسب بطاقات المستخدمين. |
| [src/styles/components/tables.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | محاذاة الحقول وأبعادها وثبات صفوف الرأس. |
| [src/styles/pages/permissions.css](D:/Work/Coding/AI/MaksabPlus/src/styles/pages/permissions.css) | احتواء البحث والمصفوفة الطويلة داخل مساحة الشاشة. |
| [src/test/columnFilters.test.ts](D:/Work/Coding/AI/MaksabPlus/src/test/columnFilters.test.ts) | اختبار المطابقة وتطابق تعريف الواجهة والترحيل. |
| [src/test/components/ColumnFilterRow.test.tsx](D:/Work/Coding/AI/MaksabPlus/src/test/components/ColumnFilterRow.test.tsx) | اختبارات الحقول والمسح والتأخير والتاريخ. |
| [src/test/components/AccountsTab.test.tsx](D:/Work/Coding/AI/MaksabPlus/src/test/components/AccountsTab.test.tsx) | تحديث محاكاة مصدر القائمة مع الحفاظ على اختبارات الحفظ. |
| [supabase/migrations/20261106100000_0063_column_filters.sql](D:/Work/Coding/AI/MaksabPlus/supabase/migrations/20261106100000_0063_column_filters.sql) | دوال بحث وإجماليات محمية؛ بدون جداول أو أعمدة جديدة. |
| [supabase/tests/051_column_filters.sql](D:/Work/Coding/AI/MaksabPlus/supabase/tests/051_column_filters.sql) | اختبارات المطابقة والإجماليات وعزل الشركات والصلاحيات. |
| [scripts/verify-column-filters.mjs](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | فحص متصفح قابل للتكرار ببيانات تجريبية بالكامل. |
| [src/pages/invoices/InvoiceTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/invoices/InvoiceTable.tsx) | وضع صف البحث تحت رؤوس الأعمدة مباشرة بنفس الخانات. |
| [src/pages/invoices/WarehouseTransferTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/invoices/WarehouseTransferTable.tsx) | وضع صف البحث تحت رؤوس الأعمدة مباشرة بنفس الخانات. |
| [src/pages/receipts/ReceiptTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/receipts/ReceiptTable.tsx) | وضع صف البحث تحت رؤوس الأعمدة مباشرة بنفس الخانات. |
| [src/pages/receipts/CashBoxTransferTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/receipts/CashBoxTransferTable.tsx) | وضع صف البحث تحت رؤوس الأعمدة مباشرة بنفس الخانات. |
| [src/pages/master-data/AccountsTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/master-data/AccountsTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/master-data/ItemsTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/master-data/ItemsTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/master-data/WarehousesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/master-data/WarehousesTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/master-data/CashBoxesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/master-data/CashBoxesTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/balances/AccountBalancesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/balances/AccountBalancesTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/balances/ItemBalancesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/balances/ItemBalancesTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/balances/CashBoxBalancesTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/balances/CashBoxBalancesTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/management/AccountOpeningTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/management/AccountOpeningTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/management/StockOpeningTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/management/StockOpeningTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/management/CashBoxOpeningTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/management/CashBoxOpeningTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| [src/pages/management/ReconciliationLogTab.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/management/ReconciliationLogTab.tsx) | تطبيق المعايير قبل التقسيم إلى صفحات، وربط المسح والمؤشرات. |
| الصور المفهرسة أدناه | ٤٨ صورة للواجهات باتجاه اليمين إلى اليسار، ببيانات صناعية فقط. |
| هذا التقرير | توثيق النطاق والنتائج والتجربة اليدوية. |

## ٢. بوابات التحقق

شُغلت بالترتيب المطلوب على النسخة النهائية:

| الأمر | النتيجة |
| --- | --- |
| npx tsc --noEmit | نجاح، صفر أخطاء. |
| npx eslint src | نجاح، صفر أخطاء وصفر تحذيرات. |
| npx vitest run | نجاح ١٧٣ اختبارًا في ٣٢ ملفًا. |
| node supabase/tests/run-local.mjs | نجاح ٥١ ملف اختبار بعد تطبيق ٦٣ ترحيلًا محليًا. |
| npx vite build | نجاح، ٢٠٧١ وحدة. |

ظهرت رسائل الموجّه المستقبلية السابقة في بعض اختبارات الواجهة؛ فحص الكود نفسه بلا تحذيرات.

فحص المتصفح نجح في ٧٢ حالة: ٢٤ مسارًا بمقاسات ١٢٨٠ و١٩٢٠ و١٣٦٦، مع تطابق عرض خانات الرأس والبحث وبدون تمرير خارجي زائد. نجحت ٨ معاينات إضافية للموظف، و٨ حالات لتطابق معايير طلب الصفوف والإجماليات للقوائم الشقيقة، و٦ تدفقات بحث ومسح للقوائم المحلية. اختُبر اختيار المنشئ والصفر والجمع مع البحث العلوي واستعادة الفترة الافتراضية والوصول لآخر صف بجدول طويل.

أداة الإعادة:

node scripts/verify-column-filters.mjs --screenshots

## ٣. قائمة الأمان ونتيجة قاعدة البيانات

- ١٩ نقطة دخول جديدة تتحقق من صلاحية الشاشة والشركة المستخرجة من الجلسة، مع مسار بحث صريح. التنفيذ للمستخدم المسجل فقط.
- الدوال الداخلية الخمس ممنوعة عن المستخدم المسجل والمجهول والجمهور.
- دوال المؤشرات الثماني السابقة تفوض للتنفيذ نفسه مع الحفاظ على الصلاحيات والتوافق.
- لم تُضف جداول أو أعمدة أو إجماليات مخزنة، ولم تتغير دوال ترحيل الأموال أو المخزون.
- اختُبر أن شركة ثانية لا تستطيع قراءة أو استنتاج صفوف الشركة الأولى أو إجمالياتها أو أسماء المنشئين. الدور المجهول ممنوع من جميع نقاط الدخول.
- التكلفة والربح محجوبان من قاعدة البيانات للموظف. التصفية بالتكلفة المحمية تُرفض، والحقول غير المعروفة تُرفض.
- نص البحث يمرر كقيمة والمطابقة حرفية، بما فيها الفواصل والأقواس والنسبة والشرطة السفلية. أسماء الجداول الديناميكية تأتي من قائمة داخلية ثابتة.
- العروض حافظت على تنفيذها بصلاحيات المستدعي، وأعمدة التكلفة الخام حافظت على القيود.
- الترحيل التالي اجتاز فحص الإنتاج داخل معاملة تم التراجع عنها، ثم طُبق وسُجل بنجاح:

20261106100000_0063_column_filters.sql

نجحت ١٠ نتائج تحقق للقراءة فقط بعد التطبيق: تطابق الصفوف والإجماليات في مصادر القوائم التسعة وعمل خيارات المنشئ. لم تُنشأ أو تُعدل مستندات إنتاج أثناء التحقق.

## ٤. ما لم أختبره وما بقي غير مؤكد

لم أجر اختبار تحميل على شركات ذات أعداد ضخمة من السجلات، أو اختبارًا للهاتف أو محركات متصفح أخرى. لم أُنشئ أو أعدل مستندات مالية فعلية على الإنتاج لاختبار الواجهة. اختبارات القواعد نفذت محليًا في معاملات تجريبية. المعاينات ببيانات صناعية.

## ٥. الافتراضات

- البحث الجديد لقوائم السجلات الرئيسية؛ جداول بنود الإدخال وكشوف الحساب داخل النوافذ تحتفظ بوظيفتها وتسلسل أرصدتها.
- الوقت يطابق الدقيقة بتوقيت القاهرة، وتاريخ سجل الفحص يعرض ويصفى بنفس المنطقة الزمنية.
- المبالغ تطابق القيمة الدقيقة؛ الأرصدة المعروضة بالقيمة المطلقة تُبحث بالقيمة نفسها.
- الافتتاحي يُبحث بالقيمة المحفوظة؛ تعديل المسودة لا يخفي صفها فجأة.
- يمكن اختيار «غير مسجل» للسجلات التي لا تحمل اسم منشئ.
- المسح يعيد القيم الافتراضية ويحافظ على الترتيب ومسودات الافتتاحي.
- القوائم الواسعة تتحرك أفقيًا داخل الجدول على الشاشات الأصغر للمحافظة على مساحة الكتابة.

## ٦. قواعد تعذر الالتزام بها

لا توجد قاعدة متعذرة ضمن نطاق التغيير. قائمة المستخدمين بطاقات، فاستخدمت وضع الشريط لنفس المكون بدل إنشاء جدول جديد. لم تتغير صلاحيات المستخدمين أو طريقة حفظ المستندات.

## ٧. التجربة اليدوية

1. افتح المبيعات؛ عند غياب مستندات اليوم اختر الفترة المناسبة من الشريط العلوي.
2. اكتب جزءًا من رقم الفاتورة وهاتف العميل داخل الحساب. اختَر مخزنًا وحالة سداد ومنشئًا.
3. جرّب صفرًا في المسدد ورقمًا عشريًا في الإجمالي؛ النتائج للقيم المساوية فقط.
4. أضف البحث العلوي؛ يجب أن تتحقق كل المعايير، والمؤشرات تشمل كل النتائج عبر الصفحات.
5. اضغط المسح في نهاية الصف؛ تختفي المعايير وتعود النهاردة والصفحة الأولى. على المقاس الأصغر تحرك أفقيًا داخل الجدول للوصول لنهايته.
6. كرر التجربة في المشتريات والمرتجعات والسندات والتحويلات والبيانات والأرصدة والافتتاحي والسجل.
7. ادخل كموظف: صف البحث مطابق للرؤوس، ولا يظهر حقل تكلفة الوحدة أو تكلفة التحويل المحميان.
8. جرّب الاسم والبريد والدور والحالة في المستخدمين ثم امسحها. المصفوفة الطويلة تتحرك داخل مساحتها.

## صور كل الشاشات

| الشاشة | ١٢٨٠ | ١٩٢٠ |
| --- | --- | --- |
| فواتير المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-sale-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-sale-1920px.png) |
| فواتير المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-purchase-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-purchase-1920px.png) |
| مرتجعات المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-sale_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-sale_return-1920px.png) |
| مرتجعات المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-purchase_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-purchase_return-1920px.png) |
| الهالك | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-waste-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-waste-1920px.png) |
| تحويلات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-warehouse_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-invoices-warehouse_transfer-1920px.png) |
| إيصالات الاستلام | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-receipts-in-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-receipts-in-1920px.png) |
| إيصالات الصرف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-receipts-out-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-receipts-out-1920px.png) |
| تحويلات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-receipts-cash_box_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-receipts-cash_box_transfer-1920px.png) |
| بيانات العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-customers-1920px.png) |
| بيانات الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-suppliers-1920px.png) |
| بيانات الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-items-1920px.png) |
| بيانات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-warehouses-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-warehouses-1920px.png) |
| بيانات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-data-cashBoxes-1920px.png) |
| أرصدة العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-customers-1920px.png) |
| أرصدة الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-suppliers-1920px.png) |
| أرصدة الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-items-1920px.png) |
| أرصدة الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-balances-cashBoxes-1920px.png) |
| افتتاحي العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-customers-1920px.png) |
| افتتاحي الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-suppliers-1920px.png) |
| افتتاحي الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-items-1920px.png) |
| افتتاحي الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-cashBoxes-1920px.png) |
| سجل الفحص | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-reconciliations-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-reconciliations-1920px.png) |
| المستخدمون | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-users-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filters-management-users-1920px.png) |
