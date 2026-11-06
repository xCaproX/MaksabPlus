# توحيد ارتفاع البحث وضبط عرض الإيصالات — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

ارتفاع خانات البحث أصبح ٣٦ بكسل، بما فيها النص والأرقام والقوائم القابلة للبحث وزر المسح، مطابقًا لحقلي التاريخ والوقت. الارتفاع معرف بقيمة مشتركة واحدة.

القياس قبل الإصلاح: الخانات العادية والقوائم كانت ٤٠ بكسل، وحقلا التاريخ والوقت ٣٦. جدول الإيصالات كان يحتاج نحو ١٢٤١ بكسل مقابل مساحة ٩٧١ عند شاشة ١٢٨٠. البيان والملاحظات كان لكل منهما حد أدنى ١٨٠ بكسل، مع حدود واسعة لباقي الأعمدة.

التخطيط الجديد للإيصالات يقلل المساحات المحجوزة والهوامش الأفقية، ويسمح بالتفاف البيان والملاحظات والأسماء. الأرقام تظل كاملة، ونفس التخطيط يستخدمه إيصال الاستلام وإيصال الصرف.

بعد الإصلاح عند ١٢٨٠: عرض التمرير ٩٧١ بكسل مقابل مساحة متاحة ٩٧١، بدون تمرير عرضي زائد. نجح أيضًا قياس ١٣٦٦ و١٩٢٠، وإيصال مرتبط بمرتجع بمبلغ ١٬٢٣٤٬٥٦٧٫٥٠ وملاحظات طويلة.

| الملف | السبب |
| --- | --- |
| [src/styles/components/tables.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | ارتفاع موحد للبحث، ومساحات دنيا أصغر للإيصالات مع التفاف النصوص. |
| [src/pages/receipts/ReceiptTable.tsx](D:/Work/Coding/AI/MaksabPlus/src/pages/receipts/ReceiptTable.tsx) | تطبيق تخطيط الإيصالات المشترك على الاستلام والصرف، وتثبيت الحد المناسب لعمود التاريخ. |
| [scripts/verify-column-filters.mjs](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | فحص تساوي الارتفاع ومنع التمرير العرضي، بما يشمل المبالغ الكبيرة والإيصالات المرتبطة. |
| الصور أدناه | معاينات للقوائم، وعدم وجود نتائج، والإيصالات المرتبطة ذات المبالغ الكبيرة. |
| هذا التقرير | سبب المشكلة والقياس والنتائج والتجربة اليدوية. |

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| npx tsc --noEmit | نجاح، صفر أخطاء. |
| npx eslint src | نجاح، صفر أخطاء وصفر تحذيرات. |
| npx vitest run | نجاح ١٧٥ اختبارًا في ٣٣ ملفًا. |
| node supabase/tests/run-local.mjs | لم يُشغل؛ لا يوجد تعديل بقاعدة البيانات. |
| npx vite build | نجاح، ٢٠٧٤ وحدة. |

نجح فحص ٢٤ مسارًا بثلاثة مقاسات، مع قياس ارتفاع كل نوع من حقول البحث واحتوائه داخل خليته. تحقق فحص الاستلام والصرف من عدم وجود تمرير أفقي عند ١٢٨٠ و١٣٦٦ و١٩٢٠.

تستمر فحوص الحالات الفارغة والمحاذاة والأسهم وفتح منتقي التاريخ والوقت والمسح وتطابق معايير الصفوف والإجماليات. اختُبرت أيضًا الإيصالات المرتبطة بملاحظات طويلة ومبلغ بالملايين في الشاشتين.

## ٣. قائمة الأمان

لا تغيير في قاعدة البيانات أو الصلاحيات أو حساب المبالغ أو حفظ المستندات. الإصلاح في تنسيق الحقول وجدول العرض فقط.

## ٤. ما لم أختبره وما بقي غير مؤكد

لم أختبر الهاتف أو محركات متصفح أخرى. المعاينة ببيانات صناعية، ولم أكتب بيانات فعلية على الإنتاج. قياسات العرض تخص المقاسات والبيانات المذكورة.

## ٥. الافتراضات

- المقصود بطول الخانات هو ارتفاعها؛ القياس أظهر فرقًا فعليًا بين ٤٠ و٣٦ بكسل.
- يسمح للبيان والملاحظات والأسماء بالظهور على سطور عند ضيق المساحة.
- تظل الأرقام وأرقام المستندات واضحة كاملة، والأعمدة قابلة للبحث كما هي.
- تخطيط الإيصالات يختلف في حدوده الدنيا عن الفواتير لأنه يحتوي على عمودي البيان والملاحظات.

## ٦. قواعد تعذر الالتزام بها

لا توجد ضمن نطاق المهمة. فحص قاعدة البيانات غير مطلوب لعدم تعديلها.

## ٧. التجربة اليدوية

1. حدّث الصفحة وراجع أن كل خانات صف البحث بنفس ارتفاع التاريخ والوقت.
2. افتح إيصالات الاستلام والصرف عند مقاس ١٢٨٠، وراجع ظهور كل الأعمدة دون تمرير أفقي زائد.
3. جرّب إيصالًا مرتبطًا ومبلغًا كبيرًا وملاحظات طويلة؛ الرقم كامل والنص يلتف.
4. اختَر فلاتر ثم امسحها، وجرّب بحثًا لا يعطي نتائج للتأكد من ثبات الأعمدة.

## صور كل الشاشات


| الشاشة | ١٢٨٠ | ١٩٢٠ |
| --- | --- | --- |
| فواتير المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-sale-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-sale-1920px.png) |
| فواتير المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-purchase-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-purchase-1920px.png) |
| مرتجعات المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-sale_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-sale_return-1920px.png) |
| مرتجعات المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-purchase_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-purchase_return-1920px.png) |
| الهالك | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-waste-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-waste-1920px.png) |
| تحويلات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-warehouse_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-invoices-warehouse_transfer-1920px.png) |
| إيصالات الاستلام | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-receipts-in-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-receipts-in-1920px.png) |
| إيصالات الصرف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-receipts-out-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-receipts-out-1920px.png) |
| تحويلات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-receipts-cash_box_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-receipts-cash_box_transfer-1920px.png) |
| بيانات العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-customers-1920px.png) |
| بيانات الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-suppliers-1920px.png) |
| بيانات الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-items-1920px.png) |
| بيانات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-warehouses-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-warehouses-1920px.png) |
| بيانات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-data-cashBoxes-1920px.png) |
| أرصدة العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-customers-1920px.png) |
| أرصدة الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-suppliers-1920px.png) |
| أرصدة الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-items-1920px.png) |
| أرصدة الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-balances-cashBoxes-1920px.png) |
| افتتاحي العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-customers-1920px.png) |
| افتتاحي الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-suppliers-1920px.png) |
| افتتاحي الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-items-1920px.png) |
| افتتاحي الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-cashBoxes-1920px.png) |
| سجل الفحص | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-reconciliations-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-reconciliations-1920px.png) |
| المستخدمون | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-users-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-management-users-1920px.png) |


[إيصال الاستلام مرتبط بمبلغ كبير — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-stress-in-1280px.png)

[إيصال الصرف مرتبط بمبلغ كبير — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-stress-out-1280px.png)

[إيصال الاستلام مرتبط بمبلغ كبير — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-stress-in-1920px.png)

[إيصال الصرف مرتبط بمبلغ كبير — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-stress-out-1920px.png)

[بحث بدون نتائج — 1280](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-empty-sales-1280px.png)

[بحث بدون نتائج — 1920](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/receipt-fit-empty-sales-1920px.png)
