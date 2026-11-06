# توسيع الحساب وتصدير جداول المستندات — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

في شاشات البضاعة والفلوس التسع، ظهر زر «تصدير الجدول إلى إكسيل» في أقصى اليسار، والفترة ومن/إلى على اليمين. الشريط منفصل عن الجدول، والمسافة أعلاه وأسفله ٢٨ بكسل، بما يحافظ على المسافة السابقة تحت الكروت.

الحد الأدنى لعرض الحساب أصبح ١٤٠ بكسل في الفواتير و١١٠ بكسل في الإيصالات، بزيادة ٢٠ بكسل من مساحة الملاحظات والبيان. عرض التاريخ والوقت والخزنة لم يتغير. اختُصر نص البحث في البيان والملاحظات إلى «بحث» ليظهر كاملًا في الخانات الضيقة.

التصدير يشمل جميع الصفوف المطابقة للفلاتر والفترة وحالة المحذوفات، بنفس ترتيب الجدول، حتى عند بدء التصدير من الصفحة الثانية. ملف إكسيل عربي من اليمين لليسار، مع عناوين ثابتة، وأرقام وتواريخ فعلية، وأسماء الأطراف والمخازن والخزن بدل معرّفاتها. تظهر فقط أعمدة الجدول المسموح بعرضها؛ تكلفة تحويل المخازن تخص المدير، ولا تُضاف أعمدة أرباح غير موجودة في الجدول.

التحميل على دفعات، مع منع التنزيل الجزئي عند فشل إحدى الدفعات أو تغير عدد النتائج. النتيجة الفارغة تُصدر عناوين الأعمدة فقط. الزر يعرض حالة الانتظار ويمنع التكرار أثناء التنفيذ، ولا يبدأ خلال انتظار تطبيق البحث أو تحميل القائمة.

| الملف | السبب |
| --- | --- |
| [المكوّن المشترك للشريط](D:/Work/Coding/AI/MaksabPlus/src/components/DocumentListToolbar.tsx) | الفترة والتصدير، وحالة الانتظار ومنع الضغط المتكرر ومعالجة الفشل. |
| [استعلام المستندات](D:/Work/Coding/AI/MaksabPlus/src/lib/documentListQuery.ts) | مصدر واحد لنفس البحث والفترة والمحذوفات والترتيب في القائمة والتصدير. |
| [تحميل النتائج الكاملة](D:/Work/Coding/AI/MaksabPlus/src/lib/exportRows.ts) | استكمال جميع الدفعات حسب العدد المستلم، ومنع تصدير بيانات ناقصة. |
| [إنشاء ملف إكسيل](D:/Work/Coding/AI/MaksabPlus/src/lib/documentExcel.ts) | أعمدة عربية مطابقة للجدول، وصلاحية التكلفة، وتنسيق القيم وحفظ الملف. |
| [صفحة البضاعة](D:/Work/Coding/AI/MaksabPlus/src/pages/Invoices.tsx) | تطبيق الشريط والتصدير في الفواتير والمرتجعات والهالك وتحويل المخازن. |
| [صفحة الفلوس](D:/Work/Coding/AI/MaksabPlus/src/pages/Receipts.tsx) | تطبيقهما في الاستلام والصرف وتحويل الخزن. |
| [جدول الفواتير](D:/Work/Coding/AI/MaksabPlus/src/pages/invoices/InvoiceTable.tsx) | تمييز تنسيق ملاحظات الفواتير، واستهلاك حالة السداد المشتركة. |
| [تنسيق الجداول](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css) | زيادة مساحة الحساب وتوزيع المساحة المتبقية على النصوص. |
| [تنسيق الشريط](D:/Work/Coding/AI/MaksabPlus/src/styles/pages/erp-workspace.css) | الزر على اليسار، والفترة على اليمين، ومسافتان متساويتان. |
| [خانات البحث](D:/Work/Coding/AI/MaksabPlus/src/components/ColumnFilterRow.tsx) | نص قصير كامل للبحث في البيان والملاحظات. |
| [تنسيق القيم](D:/Work/Coding/AI/MaksabPlus/src/lib/format.ts) | نقل وصف حالة السداد إلى مكان مشترك للقائمة والتصدير. |
| [مساعد الأعمدة](D:/Work/Coding/AI/MaksabPlus/src/lib/columnFilters.ts) | استخدام نفس تحديد حالة السداد دون تكرار القاعدة. |
| [الاعتماديات](D:/Work/Coding/AI/MaksabPlus/package.json) و[القفل](D:/Work/Coding/AI/MaksabPlus/package-lock.json) | إضافة مكتبة كتابة ملفات إكسيل؛ تُحمّل عند التصدير فقط. |
| [اختبارات التصدير](D:/Work/Coding/AI/MaksabPlus/src/test/documentExport.test.ts) | ١٦ حالة لتعدد الصفحات والفشل والحقول والقيم والصلاحية وتطابق الاستعلام. |
| [اختبارات زر التصدير](D:/Work/Coding/AI/MaksabPlus/src/test/components/DocumentListToolbar.test.tsx) | منع التكرار وإتاحة المحاولة مرة أخرى بعد الفشل. |
| [فحص المتصفح](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | تنزيل الملفات وفحص محتواها، وقياس المسافات وظهور نصوص البحث كاملة. |
| الصور أدناه وهذا التقرير | معاينة النتيجة وتوثيق الفحوص وحدودها. |

## ٢. بوابات التحقق

نُفذت بالترتيب على النسخة النهائية:

| الأمر | النتيجة |
| --- | --- |
| `npx tsc --noEmit` | نجاح، دون أخطاء. |
| `npx eslint src` | نجاح، صفر أخطاء وصفر تحذيرات. |
| `npx vitest run` | نجاح ١٩٤ اختبارًا في ٣٥ ملفًا. |
| `node supabase/tests/run-local.mjs` | لم يُشغّل؛ لا تغيير في قاعدة البيانات. |
| `npx vite build` | نجاح، ٢١٦١ وحدة. |

فحص المتصفح ببيانات محاكاة ودون الاتصال بالإنتاج:
- ١٠ تنزيلات فعلية لكل أنواع المستندات، ومنها موظف بدون تكلفة التحويل.
- تصدير ١٠٠٣ صفوف من الصفحة الثانية، مع حد خادم تجريبي ٣٧ صفًا لكل استجابة؛ الملف شمل النتائج كلها.
- ملف للنتيجة الفارغة بعناوين فقط، وفشل متعمد في الدفعة الثانية دون تنزيل ملف ناقص.
- فحص محتوى الملف: ترتيب الأعمدة، النص العربي، اتجاه الورقة، سلامة اليوم في التاريخ، والملاحظات النصية دون معادلات.
- ٧٢ معاينة للقوائم في ثلاثة مقاسات، و٤٦ حالة نتائج فارغة، و٢٤ تغيير حجم في الوضع الفارغ، و٨ حالات إيصالات بمبالغ كبيرة.
- اختبار منتقي التاريخ والوقت، و٨ أزواج من طلبات النتائج والمؤشرات، و٦ حالات بحث محلي وإعادة ضبط، و٨ حالات عرض للموظف.
- ١٨ حالة دخول مباشر إلى الثلاث نقاط وفتح القائمة وإغلاقها.
- بعد تثبيت المسافة النهائية، أُعيد فحص الشاشات التسع في ثلاثة مقاسات: ٢٧ معاينة ناجحة، مع ظهور نصوص البحث كاملة والمسافتين متساويتين.

## ٣. الأمان

- لا ترحيلات أو جداول أو دوال أو صلاحيات جديدة في قاعدة البيانات.
- التصدير يقرأ من نفس الدوال الحالية التي تقرأ منها القائمة؛ لا بيانات اتصال خاصة أو حساب خدمة.
- نصوص البحث تُمرّر كقيم منظمة للدوال الحالية، دون تركيب نص بحث غير مهرب.
- الملف يحتوي أعمدة العرض المعتمدة فقط، والتكلفة تُحذف من التصدير للموظف؛ اختُبر ذلك في الملف الفعلي.
- الأسماء والملاحظات تُكتب كخلايا نصية صريحة حتى عند بدئها بعلامة يساوي؛ فُحص الملف للتأكد من عدم وجود معادلات.
- لم تُعَد اختبارات عزل الشركات ودور المجهول على قاعدة البيانات؛ لم يتغير مسار الحماية في قاعدة البيانات.

## ٤. ما لم أختبره والحدود

لم أفتح الملفات في تطبيق إكسيل المكتبي؛ اختبرت تنزيلها وبنيتها ومحتواها وتنسيقاتها. لم أختبر الموبايل أو المتصفحات الأخرى أو بيانات الإنتاج. لم أختبر ملايين الصفوف أو تعديلات متزامنة تحتفظ بنفس عدد الصفوف أثناء التصدير؛ العملية ليست لقطة ثابتة من قاعدة البيانات بين الدفعات. تغير العدد أثناء التحميل يمنع حفظ ملف قد يكون ناقصًا.

## ٥. الافتراضات

- التصدير في شاشات مستندات البضاعة والفلوس التسع، ويشمل كل النتائج المطابقة لا الصفحة الحالية فقط، كما تم الاتفاق.
- الأعمدة مطابقة للجدول؛ الإجراءات وصف البحث لا يدخلان في الملف، ولا تُضاف أعمدة مخفية.
- زيادة الحساب ٢٠ بكسل حدًا أدنى، والنصوص الطويلة تستمر في الالتفاف داخل المساحة المتاحة.
- النتيجة الفارغة تصدر عناوين الأعمدة وحدها.
- المسافة المتساوية ٢٨ بكسل، لتطابق المسافة السابقة بين الكروت والشريط.

## ٦. قواعد تعذر استيفاؤها

لا يوجد. اختبارات قاعدة البيانات غير مطلوبة لهذا التغيير، وحدود الاختبار مذكورة أعلاه.

## ٧. التجربة اليدوية

١. حدّث الصفحة وافتح إيصالات الاستلام ثم الصرف: الحساب أوسع، والبيان والملاحظات يستفيدان من المساحة المتبقية، والخزنة الرئيسية في سطر واحد.

٢. راجع الفترة ومن/إلى على اليمين، وزر التصدير على اليسار، والمسافة المتساوية فوق الشريط وتحته.

٣. اختر فترة وابحث في الحساب أو الملاحظات أو بواسطة، ثم انتقل إلى الصفحة الثانية واضغط التصدير: افتح الملف وتأكد أنه يشمل كل الصفوف المطابقة وبنفس ترتيب الجدول.

٤. كرر في المبيعات والمشتريات والمرتجعات والهالك وتحويل المخازن والخزن، ثم اختبر عرض المحذوفات.

٥. جرّب مستخدمًا موظفًا: تكلفة تحويل المخازن غير موجودة في الملف. جرّب بحثًا بلا نتائج: الملف يحتوي العناوين فقط.

٦. افصل الاتصال أثناء تصدير عدة صفحات: تظهر رسالة فشل دون ملف ناقص، ويمكن إعادة المحاولة.

## صور المعاينة

- [معاينة 1](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-cashBoxes-1280px.png)
- [معاينة 2](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-cashBoxes-1920px.png)
- [معاينة 3](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-customers-1280px.png)
- [معاينة 4](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-customers-1920px.png)
- [معاينة 5](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-items-1280px.png)
- [معاينة 6](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-items-1920px.png)
- [معاينة 7](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-suppliers-1280px.png)
- [معاينة 8](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-balances-suppliers-1920px.png)
- [معاينة 9](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-cashBoxes-1280px.png)
- [معاينة 10](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-cashBoxes-1920px.png)
- [معاينة 11](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-customers-1280px.png)
- [معاينة 12](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-customers-1920px.png)
- [معاينة 13](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-items-1280px.png)
- [معاينة 14](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-items-1920px.png)
- [معاينة 15](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-suppliers-1280px.png)
- [معاينة 16](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-suppliers-1920px.png)
- [معاينة 17](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-warehouses-1280px.png)
- [معاينة 18](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-data-warehouses-1920px.png)
- [معاينة 19](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-purchase-1280px.png)
- [معاينة 20](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-purchase-1920px.png)
- [معاينة 21](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-purchase_return-1280px.png)
- [معاينة 22](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-purchase_return-1920px.png)
- [معاينة 23](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-sale-1280px.png)
- [معاينة 24](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-sale-1920px.png)
- [معاينة 25](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-sale_return-1280px.png)
- [معاينة 26](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-sale_return-1920px.png)
- [معاينة 27](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-warehouse_transfer-1280px.png)
- [معاينة 28](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-warehouse_transfer-1920px.png)
- [معاينة 29](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-waste-1280px.png)
- [معاينة 30](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-invoices-waste-1920px.png)
- [معاينة 31](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-cashBoxes-1280px.png)
- [معاينة 32](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-cashBoxes-1920px.png)
- [معاينة 33](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-customers-1280px.png)
- [معاينة 34](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-customers-1920px.png)
- [معاينة 35](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-items-1280px.png)
- [معاينة 36](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-items-1920px.png)
- [معاينة 37](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-reconciliations-1280px.png)
- [معاينة 38](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-reconciliations-1920px.png)
- [معاينة 39](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-suppliers-1280px.png)
- [معاينة 40](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-suppliers-1920px.png)
- [معاينة 41](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-users-1280px.png)
- [معاينة 42](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-management-users-1920px.png)
- [معاينة 43](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-receipts-cash_box_transfer-1280px.png)
- [معاينة 44](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-receipts-cash_box_transfer-1920px.png)
- [معاينة 45](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-receipts-in-1280px.png)
- [معاينة 46](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-receipts-in-1920px.png)
- [معاينة 47](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-receipts-out-1280px.png)
- [معاينة 48](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/document-export-receipts-out-1920px.png)
