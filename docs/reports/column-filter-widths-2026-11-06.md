# إصلاح عرض خانات البحث — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

أُزيلت الحدود الدنيا التي كانت خانات البحث تفرضها على الأعمدة. أصبحت رؤوس الجدول وبياناته تحدد العرض الأصلي، وخانات البحث تملأ المساحة المتاحة دون إضافة عرض إلى الجدول. أُخفيت أيقونات التقويم وأسهم القوائم والساعة من خانات صف البحث، مع الحفاظ على زر المسح في آخره. حقول شريط الفلاتر العلوي تحتفظ بتنسيقها.

قوائم الاختيار في صف البحث تظهر خارج حاوية تمرير الجدول؛ اختُبر اختيار المنشئ في جدول قصير حتى لا يحجب ترقيم الصفحات الخيارات.

| الملف | السبب |
| --- | --- |
| [src/components/ColumnFilterRow.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/ColumnFilterRow.tsx) | حقول البحث بدون أيقونات، مع الحفاظ على زر المسح. |
| [src/components/DateInput.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/DateInput.tsx) | خيار لإخفاء زر التقويم وتحديد النص الإرشادي في صف البحث؛ بقية الاستخدامات تحتفظ بشكلها. |
| [src/components/SearchableSelect.tsx](D:/Work/Coding/AI/MaksabPlus/src/components/SearchableSelect.tsx) | خيار لإخفاء السهم، وقائمة خيارات عائمة لخانات الجدول حتى لا تحجبها حدود التمرير. |
| [src/styles/components/tables.css](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | إلغاء عروض البحث الدنيا؛ الأعمدة الأصلية وحدها تحدد العرض، والخانات تملأ مساحتها. |
| [src/test/components/ColumnFilterRow.test.tsx](D:/Work/Coding/AI/MaksabPlus/src/test/components/ColumnFilterRow.test.tsx) | التحقق من اختفاء أيقونات الحقول ووجود النص الإرشادي واستمرار البحث. |
| [scripts/verify-column-filters.mjs](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | مقارنة عروض الأعمدة والتمرير بصف البحث وبدونه، والتحقق من احتواء الخانات. |
| الصور أدناه | ٤٨ معاينة جديدة عند ١٢٨٠ و١٩٢٠ لكل الشاشات المعدلة. |
| هذا التقرير | نتائج الفحص والحدود والتجربة اليدوية. |

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| npx tsc --noEmit | نجاح، صفر أخطاء. |
| npx eslint src | نجاح، صفر أخطاء وصفر تحذيرات. |
| npx vitest run | نجاح ١٧٣ اختبارًا في ٣٢ ملفًا. |
| node supabase/tests/run-local.mjs | لم يُشغل لهذه المهمة؛ لا يوجد تغيير بقاعدة البيانات. |
| npx vite build | نجاح، ٢٠٧١ وحدة. |

نجح قياس ٢٤ شاشة بثلاثة مقاسات: ١٩٢٠ و١٢٨٠ و١٣٦٦. قورنت عروض جميع الأعمدة وعرض التمرير قبل إزالة صف البحث وبعد إزالته؛ الصف لا يضيف عرضًا. تحقق الفحص من احتواء الخانات داخل خلاياها ومن غياب أيقونات الحقول.

نجحت أيضًا ٨ معاينات للموظف، و٨ تدفقات بحث للخوادم الشقيقة، و٦ تدفقات بحث ومسح للقوائم المحلية. اختيار المنشئ ومسح الفلاتر والبحث بالصفر والتمرير بجدول طويل نجحوا.

## ٣. قائمة الأمان

التعديل في العرض فقط. لا تغيير في الأموال أو المخزون أو الصلاحيات أو استعلامات قاعدة البيانات. لا توجد دوال أو جداول أو سياسات قاعدة بيانات جديدة أو معدلة.

## ٤. ما لم أختبره وما بقي غير مؤكد

لم أختبر الهاتف أو محركات متصفح أخرى، ولم أكتب بيانات فعلية على الإنتاج. المعاينة ببيانات صناعية.

عند ضيق مساحة الشاشة قد يظل الجدول الأصلي نفسه يحتاج إلى تمرير أفقي؛ القياس يثبت أن خانات البحث لا تزيد العرض أو التمرير مقارنة بالجدول نفسه دونها.

## ٥. الافتراضات

- زر المسح يحتفظ برمز الإلغاء المتفق عليه؛ إزالة الأيقونات تخص الحقول.
- التاريخ يكتب بنفس ترتيب اليوم ثم الشهر ثم السنة.
- القوائم تظل قابلة للبحث والاختيار رغم إخفاء الأسهم.
- عروض الأعمدة الأصلية هي المرجع، دون ضغط محتوياتها أو تغييرها.

## ٦. قواعد تعذر الالتزام بها

لا توجد ضمن نطاق المهمة. فحص قاعدة البيانات غير مطلوب لعدم تعديلها.

## ٧. التجربة اليدوية

1. حدّث صفحة الفواتير، وراجع عرض الأعمدة وصف البحث.
2. تأكد أن خانات التاريخ والمخزن والحالة والمنشئ بلا أيقونات.
3. اكتب تاريخًا واختَر مخزنًا ومنشئًا، وجرّب الصفر في المسدد.
4. افتح قائمة المنشئ في جدول قصير؛ الخيارات يجب أن تظهر فوق المحتوى ويمكن الضغط عليها.
5. اضغط زر المسح وتأكد من رجوع الفلاتر للوضع الافتراضي.
6. كرر التجربة في السندات والتحويلات وباقي القوائم، وعند المقاسين الموجودين بالصور.

## صور كل الشاشات


| الشاشة | ١٢٨٠ | ١٩٢٠ |
| --- | --- | --- |
| فواتير المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-sale-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-sale-1920px.png) |
| فواتير المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-purchase-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-purchase-1920px.png) |
| مرتجعات المبيعات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-sale_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-sale_return-1920px.png) |
| مرتجعات المشتريات | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-purchase_return-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-purchase_return-1920px.png) |
| الهالك | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-waste-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-waste-1920px.png) |
| تحويلات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-warehouse_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-invoices-warehouse_transfer-1920px.png) |
| إيصالات الاستلام | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-receipts-in-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-receipts-in-1920px.png) |
| إيصالات الصرف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-receipts-out-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-receipts-out-1920px.png) |
| تحويلات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-receipts-cash_box_transfer-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-receipts-cash_box_transfer-1920px.png) |
| بيانات العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-customers-1920px.png) |
| بيانات الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-suppliers-1920px.png) |
| بيانات الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-items-1920px.png) |
| بيانات المخازن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-warehouses-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-warehouses-1920px.png) |
| بيانات الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-data-cashBoxes-1920px.png) |
| أرصدة العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-customers-1920px.png) |
| أرصدة الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-suppliers-1920px.png) |
| أرصدة الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-items-1920px.png) |
| أرصدة الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-balances-cashBoxes-1920px.png) |
| افتتاحي العملاء | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-customers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-customers-1920px.png) |
| افتتاحي الموردين | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-suppliers-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-suppliers-1920px.png) |
| افتتاحي الأصناف | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-items-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-items-1920px.png) |
| افتتاحي الخزن | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-cashBoxes-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-cashBoxes-1920px.png) |
| سجل الفحص | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-reconciliations-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-reconciliations-1920px.png) |
| المستخدمون | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-users-1280px.png) | [معاينة](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/column-filter-fit-management-users-1920px.png) |

