# لون الاختيار العام في الفلاتر — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

«الكل» و«كل الفترات» والاختيارات العامة في القوائم القابلة للبحث داخل الفلاتر أصبحت بلون النص الإرشادي نفسه. الاختيار المحدد والكتابة داخل القائمة يحتفظان باللون الطبيعي. تنسيق الألوان يخص الفلاتر، ولا يغير آلية البحث أو التحميل.

| الملف | السبب |
| --- | --- |
| [مكوّن القائمة](D:/Work/Coding/AI/MaksabPlus/src/components/SearchableSelect.tsx) | إتاحة القيمة المحددة للتنسيق المشترك، دون تغيير سلوك الاختيار. |
| [تنسيق الحقول](D:/Work/Coding/AI/MaksabPlus/src/styles/components/forms.css) | نفس تعريف لون النص الإرشادي للاختيارات العامة داخل الفلاتر فقط. |
| [فحص المتصفح](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs) | فحص اللون المحسوب للحالات العامة والمحددة والكتابة، وتصوير الشاشات. |
| هذا التقرير والصور أدناه | توثيق التعديل والفحوص وشرح تدفق البيانات. |

### الفلاتر تتعامل مع البيانات إزاي؟

الشرح التالي من قراءة مسارات التحميل الحالية؛ لم تتغير استعلامات البيانات في هذا التعديل.

| الموضع | ما يحدث |
| --- | --- |
| الفواتير والإيصالات وتحويلات المخازن والخزن | تغيير الفترة أو بحث الأعمدة يرسل طلبًا جديدًا لقاعدة البيانات، بالشروط مجتمعة، وترجع صفحة النتائج المطلوبة. طلب آخر يحسب مؤشرات الكروت على كامل النتائج المطابقة. |
| العملاء والموردون والأصناف، وأرصدة الحسابات والأصناف، وسجل المطابقة | فلاتر الجدول تُطبّق في قاعدة البيانات بطلبات جديدة. |
| المخازن والخزن والمستخدمون والأرصدة الافتتاحية وقائمة أرصدة الخزن | الفلاتر تُطبّق محليًا على البيانات المحملة، ثم يتم تقسيم النتائج إلى صفحات. |
| الكتابة داخل قائمة اختيارات المخزن أو الحالة ونحوها | تبحث محليًا في الاختيارات المحملة؛ اختيار قيمة هو الذي يغير فلتر الجدول. |
| قائمة «بواسطة» | يجري تحميل اختيارات المستخدمين من قاعدة البيانات أثناء البحث داخل القائمة، ثم اختيار اسم يغير فلتر الجدول. |
| كشوف حساب العميل والمورد والخزنة والصنف | تحميل الكشف يتم من قاعدة البيانات عند إرسال نموذج العرض بالفترة المطلوبة. |

بحث الأعمدة ينتظر ٣٠٠ ملّي ثانية بعد آخر تعديل قبل اعتماد الشروط. الفترة العلوية تحدث مباشرة. بحث اختيارات «بواسطة» له انتظار ٢٥٠ ملّي ثانية داخل مكوّن القائمة.

مصادر الشرح:
- [استعلام المستندات](D:/Work/Coding/AI/MaksabPlus/src/lib/documentListQuery.ts) و[تحميل مؤشرات الفواتير](D:/Work/Coding/AI/MaksabPlus/src/pages/Invoices.tsx) و[الإيصالات](D:/Work/Coding/AI/MaksabPlus/src/pages/Receipts.tsx).
- [تأخير بحث الأعمدة](D:/Work/Coding/AI/MaksabPlus/src/lib/useColumnFilters.ts).
- [خيارات بواسطة](D:/Work/Coding/AI/MaksabPlus/src/lib/columnFilters.ts).
- أمثلة التصفية المحلية: [المخازن](D:/Work/Coding/AI/MaksabPlus/src/pages/master-data/WarehousesTab.tsx)، [الخزن](D:/Work/Coding/AI/MaksabPlus/src/pages/master-data/CashBoxesTab.tsx)، [المستخدمون](D:/Work/Coding/AI/MaksabPlus/src/components/UserPermissions.tsx)، [الأرصدة الافتتاحية](D:/Work/Coding/AI/MaksabPlus/src/pages/management/AccountOpeningTab.tsx).

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| `npx tsc --noEmit` | نجاح، دون أخطاء. |
| `npx eslint src` | نجاح، صفر أخطاء وصفر تحذيرات. |
| `npx vitest run` | نجاح ١٩٤ اختبارًا في ٣٥ ملفًا. |
| `node supabase/tests/run-local.mjs` | لم يُشغّل؛ لا تغيير في قاعدة البيانات. |
| `npx vite build` | نجاح، ٢١٦١ وحدة. |

فحص اللون في المتصفح فشل قبل إصلاح التنسيق: «الكل» كانت بلون مختلف عن النص الإرشادي. بعد الإصلاح نجحت ٤٨ معاينة للواجهات العربية على عرضي ١٢٨٠ و١٩٢٠ بكسل: ١٠٢ حالة اختيار عام أو حقل فارغ مطابق للون النص الإرشادي، و٣٦ حالة اختيار محدد وكتابة باللون الطبيعي.

## ٣. الأمان

لا تغيير في قاعدة البيانات أو الاستعلامات أو الصلاحيات. لا اختبارات عزل شركات جديدة لهذا التعديل البصري. لا بيانات إنتاج في الصور؛ فحص المتصفح يستخدم ردودًا وبيانات تجريبية.

## ٤. ما لم أختبره والحدود

لم أختبر الموبايل أو المتصفحات الأخرى. شرح طلبات البيانات مبني على قراءة الكود الحالي؛ لم أسجل أو أقس طلبات الإنتاج أو زمنها، ولم أعد فحوص استعلامات قاعدة البيانات لهذا التعديل.

## ٥. الافتراضات

الاختيار العام هو القيمة الفارغة أو قيمة «الكل» المستخدمة في الفلاتر، ويشمل «كل الفترات». التغيير يخص النص الظاهر في الحقل؛ الخيارات داخل القائمة تظل بتنسيقها المعتاد.

## ٦. قواعد تعذر استيفاؤها

لا يوجد. اختبارات قاعدة البيانات غير مطلوبة لأن التغيير لا يمسها.

## ٧. التجربة اليدوية

١. حدّث الصفحة وافتح المبيعات أو الإيصالات: «الكل» في خانات البحث بلون النص الإرشادي.

٢. اختر مخزنًا أو نوع حساب أو حالة سداد: اسم الاختيار المحدد باللون الطبيعي.

٣. اكتب داخل القائمة: نص البحث باللون الطبيعي. امسح الفلاتر: يرجع الاختيار العام للون النص الإرشادي.

٤. جرّب «كل الفترات» في الفترة، وكرر في قوائم البيانات والأرصدة والمستخدمين.

## صور المعاينة

- [معاينة 1](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-cashBoxes-1280px.png)
- [معاينة 2](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-cashBoxes-1920px.png)
- [معاينة 3](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-customers-1280px.png)
- [معاينة 4](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-customers-1920px.png)
- [معاينة 5](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-items-1280px.png)
- [معاينة 6](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-items-1920px.png)
- [معاينة 7](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-suppliers-1280px.png)
- [معاينة 8](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-balances-suppliers-1920px.png)
- [معاينة 9](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-cashBoxes-1280px.png)
- [معاينة 10](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-cashBoxes-1920px.png)
- [معاينة 11](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-customers-1280px.png)
- [معاينة 12](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-customers-1920px.png)
- [معاينة 13](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-items-1280px.png)
- [معاينة 14](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-items-1920px.png)
- [معاينة 15](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-suppliers-1280px.png)
- [معاينة 16](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-suppliers-1920px.png)
- [معاينة 17](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-warehouses-1280px.png)
- [معاينة 18](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-data-warehouses-1920px.png)
- [معاينة 19](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-purchase-1280px.png)
- [معاينة 20](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-purchase-1920px.png)
- [معاينة 21](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-purchase_return-1280px.png)
- [معاينة 22](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-purchase_return-1920px.png)
- [معاينة 23](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-sale-1280px.png)
- [معاينة 24](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-sale-1920px.png)
- [معاينة 25](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-sale_return-1280px.png)
- [معاينة 26](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-sale_return-1920px.png)
- [معاينة 27](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-warehouse_transfer-1280px.png)
- [معاينة 28](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-warehouse_transfer-1920px.png)
- [معاينة 29](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-waste-1280px.png)
- [معاينة 30](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-invoices-waste-1920px.png)
- [معاينة 31](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-cashBoxes-1280px.png)
- [معاينة 32](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-cashBoxes-1920px.png)
- [معاينة 33](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-customers-1280px.png)
- [معاينة 34](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-customers-1920px.png)
- [معاينة 35](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-items-1280px.png)
- [معاينة 36](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-items-1920px.png)
- [معاينة 37](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-reconciliations-1280px.png)
- [معاينة 38](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-reconciliations-1920px.png)
- [معاينة 39](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-suppliers-1280px.png)
- [معاينة 40](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-suppliers-1920px.png)
- [معاينة 41](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-users-1280px.png)
- [معاينة 42](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-management-users-1920px.png)
- [معاينة 43](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-receipts-cash_box_transfer-1280px.png)
- [معاينة 44](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-receipts-cash_box_transfer-1920px.png)
- [معاينة 45](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-receipts-in-1280px.png)
- [معاينة 46](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-receipts-in-1920px.png)
- [معاينة 47](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-receipts-out-1280px.png)
- [معاينة 48](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/muted-all-filters-receipts-out-1920px.png)
