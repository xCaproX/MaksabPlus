# تحسين حقول البحث وثبات الأعمدة — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

نُفذت الطلبات الخمسة في المكونات المشتركة:

- النص الإرشادي يبدأ من اليمين، مع بقاء القيم الرقمية والتاريخ والوقت من اليسار عند إدخالها.
- زر التقويم عاد داخل نفس عرض الخانة.
- الوقت أصبح بنفس شكل وسلوك التاريخ؛ زر الساعة يفتح أداة اختيار الوقت الأصلية.
- الحقول الرقمية تعرض علامة المساواة بدل كلمة «يساوي».
- الأعمدة تحتفظ بمقاساتها أثناء التحميل وعند غياب النتائج، وزر المسح لا يخرج من خليته.

السبب المقاس قبل الإصلاح: في المبيعات عند ١٩٢٠، انكمش عمود الإجراءات من نحو ٥٥ إلى ٢٧ بكسل بعد غياب النتائج، وزاد عرض التمرير من ١٥٩٨ إلى ١٦١٤ بسبب زر المسح. بعد الإصلاح ظلت مقاسات الأعمدة وعرض التمرير ثابتة.

| الملف | السبب |
| --- | --- |
| [src/components/ColumnFilterRow.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/ColumnFilterRow.tsx) | إرجاع التقويم، توحيد الوقت، والنص الرقمي الجديد. |
| [src/components/PickerInput.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/PickerInput.tsx) | مكوّن مشترك للكتابة والتحقق وفتح أداة الاختيار والمسح. |
| [src/components/DateInput.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/DateInput.tsx) | الحفاظ على واجهة التاريخ عبر المكوّن المشترك. |
| [src/components/TimeInput.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/TimeInput.tsx) | حقل وقت بنفس شكل وسلوك التاريخ، مع زر الساعة. |
| [src/lib/useStableTableColumns.ts](D:/Work/Coding/AI/MaksabPlus/src/lib/useStableTableColumns.ts) | تثبيت توزيع الأعمدة أثناء التحميل وغياب النتائج. |
| [src/styles/components/tables.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | اتجاه النص الإرشادي والأزرار المضغوطة واحتواء زر المسح. |
| [src/test/components/ColumnFilterRow.test.tsx](D:/Work/Coding/AI/MaksabPlus/src/test/components/ColumnFilterRow.test.tsx) | اختبارات الأيقونات وعلامة المساواة والتصفية والمسح. |
| [src/test/components/PickerInput.test.tsx](D:/Work/Coding/AI/MaksabPlus/src/test/components/PickerInput.test.tsx) | اختبار الأدوات الأصلية والاختيار والكتابة ورفض الوقت غير الصحيح والمسح. |
| [scripts/verify-column-filters.mjs](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | قياس الأعمدة والتمرير عند غياب النتائج وفتح أدوات الاختيار فعليًا. |
| الصور أدناه | ٤٨ معاينة للقوائم وصورتان للمبيعات بدون نتائج. |
| هذا التقرير | النتائج والقياسات والحدود والتجربة اليدوية. |

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| npx tsc --noEmit | نجاح، صفر أخطاء. |
| npx eslint src | نجاح، صفر أخطاء وصفر تحذيرات. |
| npx vitest run | نجاح ١٧٥ اختبارًا في ٣٣ ملفًا. |
| node supabase/tests/run-local.mjs | لم يُشغل؛ المهمة لا تعدل قاعدة البيانات. |
| npx vite build | نجاح، ٢٠٧٤ وحدة. |

نجحت معاينة ٢٤ مسارًا بثلاثة مقاسات، و٤٦ حالة بحث بدون نتائج بمقاسي ١٢٨٠ و١٩٢٠. قيس كل عمود قبل غياب النتائج وبعده، مع فروق كسور أقل من بكسل. عرض التمرير لم يزد؛ قد ينقص بكسل تقريبي عند اختفاء نص الصفوف.

نجح فتح منتقي التاريخ ومنتقي الوقت الأصليين فعليًا في المتصفح دون أخطاء. استمر نجاح البحث بالصفر واختيار المنشئ والمسح وفحوص الموظف والقوائم الشقيقة.

## ٣. قائمة الأمان

لا تعديل في قاعدة البيانات أو الاستعلامات أو الصلاحيات أو ترحيل الأموال والمخزون. التغيير في الحقول وتوزيع الجدول فقط.

## ٤. ما لم أختبره وما بقي غير مؤكد

لم أختبر الهاتف أو محركات متصفح أخرى. البيانات والصور صناعية. لوحة الاختيار الأصلية قد تختلف حسب المتصفح ونظام التشغيل، بينما شكل الحقل والزر موحدان.

## ٥. الافتراضات

- الوقت يكتب بنظام ٢٤ ساعة ويستخدم نفس قيمة الفلتر السابقة بدقة الدقيقة.
- توزيع الأعمدة عند وجود بيانات هو المرجع عند غيابها. أول تحميل فارغ يحجز مساحة مناسبة لزر المسح.
- الحد الأدنى الأصلي للجدول مستمر؛ الإصلاح يمنع التمرير الزائد الناتج عن خانات البحث أو غياب النتائج.
- رمز زر المسح ووظيفته مستمران.

## ٦. قواعد تعذر الالتزام بها

لا توجد ضمن النطاق. فحص قاعدة البيانات غير مطلوب لعدم تعديلها.

## ٧. التجربة اليدوية

1. حدّث المبيعات وراجع اتجاه النص الإرشادي وعلامة المساواة.
2. اضغط التقويم والساعة واختر تاريخًا ووقتًا؛ الحقول لا توسع الأعمدة.
3. جرّب كتابة الوقت ومسحه، ثم تحقق من اختفاء الفلتر.
4. ابحث برقم غير موجود؛ راقب ثبات الأعمدة وعدم زيادة التمرير الأفقي.
5. اضغط المسح وكرر التجربة في باقي القوائم.

## صور كل الشاشات


| الشاشة | ١٢٨٠ | ١٩٢٠ |
| --- | --- | --- |
| فواتير المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-sale-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-sale-1920px.png) |
| فواتير المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-purchase-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-purchase-1920px.png) |
| مرتجعات المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-sale_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-sale_return-1920px.png) |
| مرتجعات المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-purchase_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-purchase_return-1920px.png) |
| الهالك | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-waste-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-waste-1920px.png) |
| تحويلات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-warehouse_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-invoices-warehouse_transfer-1920px.png) |
| إيصالات الاستلام | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-receipts-in-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-receipts-in-1920px.png) |
| إيصالات الصرف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-receipts-out-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-receipts-out-1920px.png) |
| تحويلات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-receipts-cash_box_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-receipts-cash_box_transfer-1920px.png) |
| بيانات العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-customers-1920px.png) |
| بيانات الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-suppliers-1920px.png) |
| بيانات الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-items-1920px.png) |
| بيانات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-warehouses-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-warehouses-1920px.png) |
| بيانات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-data-cashBoxes-1920px.png) |
| أرصدة العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-customers-1920px.png) |
| أرصدة الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-suppliers-1920px.png) |
| أرصدة الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-items-1920px.png) |
| أرصدة الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-balances-cashBoxes-1920px.png) |
| افتتاحي العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-customers-1920px.png) |
| افتتاحي الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-suppliers-1920px.png) |
| افتتاحي الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-items-1920px.png) |
| افتتاحي الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-cashBoxes-1920px.png) |
| سجل الفحص | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-reconciliations-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-reconciliations-1920px.png) |
| المستخدمون | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-users-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-management-users-1920px.png) |


## صور المبيعات بدون نتائج

[١٢٨٠](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-empty-sales-1280px.png)

[١٩٢٠](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-controls-empty-sales-1920px.png)
