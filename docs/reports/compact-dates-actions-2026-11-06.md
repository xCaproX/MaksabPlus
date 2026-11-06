# تقليل عرض التاريخ والوقت وإصلاح ظهور الإجراءات — ٦ نوفمبر ٢٠٢٦

## ١. ما تغير

- [المقاسات](D:/Work/Coding/AI/MaksabPlus/src/styles/tokens.css): التاريخ ١٠٠ والوقت ٨٠ بكسل، والتوقيت المركب ١٨٠ بكسل في التنسيق المشترك.
- [تنسيق الجداول](D:/Work/Coding/AI/MaksabPlus/src/styles/components/tables.css): إخفاء الإجراءات بالشفافية، لتستجيب لدخول المؤشر مباشرة إلى موضعها. تستمر الاستجابة لتركيز لوحة المفاتيح، وتظل ظاهرة على الشاشات الصغيرة.
- [فحص المتصفح](D:/Work/Coding/AI/MaksabPlus/scripts/verify-column-filters.mjs): المقاسات الجديدة، و١٨ حالة مرور مباشر وفتح قائمة الإجراءات وإغلاقها.
- التقرير والصور أدناه لتوثيق النتيجة.

## ٢. بوابات التحقق

| الأمر | النتيجة |
| --- | --- |
| `npx tsc --noEmit` | نجاح، دون أخطاء. |
| `npx eslint src` | نجاح، دون أخطاء أو تحذيرات. |
| `npx vitest run` | نجاح ١٧٦ اختبارًا في ٣٣ ملفًا. |
| `node supabase/tests/run-local.mjs` | لم يُشغّل؛ لا تغيير في قاعدة البيانات. |
| `npx vite build` | نجاح، ٢٠٧٤ وحدة. |

فحص المتصفح يستخدم بيانات محاكاة بالكامل دون الاتصال بالإنتاج. فشل اختبار المرور المباشر قبل الإصلاح ونجح بعده. اختُبرت ٢٤ شاشة في ثلاثة مقاسات، و٤٦ حالة نتائج فارغة، و٢٤ حالة تغيير حجم في الوضع الفارغ، و٨ حالات إيصالات بمبالغ كبيرة، وفتح منتقي التاريخ والوقت، والبحث وإعادة الضبط وصلاحيات عرض الموظفين.

## ٣. الأمان

لا تغيير في قاعدة البيانات أو الصلاحيات أو طريقة البحث؛ لا تنطبق اختبارات عزل الشركات الخاصة بتغييرات قاعدة البيانات.

## ٤. ما لم يُختبر والحدود

لم أختبر الموبايل أو المتصفحات الأخرى أو بيانات الإنتاج. لم أنفذ تعديلًا أو حذفًا حقيقيًا؛ اختبرت فتح قائمة الإجراءات وإغلاقها فقط.

## ٥. الافتراضات

المقاسات هي العرض الكلي لعمود الجدول شامل الحشو، وخانات البحث تتبع مساحته الداخلية. نماذج الإدخال تحتفظ بتنسيقها. عرض الخزنة يظل ١٢٤ بكسل.

## ٦. قواعد تعذر استيفاؤها

لا يوجد.

## ٧. التجربة اليدوية

١. حدّث الصفحة وافتح فواتير المبيعات ثم إيصالات الاستلام والصرف.
٢. حرّك المؤشر من خارج الصف مباشرة إلى موضع الثلاث نقاط: تظهر وتفتح القائمة عند الضغط.
٣. انتقل إلى الزر بلوحة المفاتيح وافتح القائمة ثم أغلقها بمفتاح الهروب.
٤. جرّب بحثًا بلا نتائج وتغيير حجم النافذة: يظل التاريخ ١٠٠ والوقت ٨٠ بكسل.

## صور المعاينة

فحص إضافي: ٦ كشوف حساب بصفوف تجريبية على عرضي ١٢٨٠ و١٩٢٠؛ التاريخ ١٠٠ بكسل في الرأس والصفوف.

- [معاينة 1](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-cashBoxes-1280px.png)
- [معاينة 2](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-cashBoxes-1920px.png)
- [معاينة 3](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-customers-1280px.png)
- [معاينة 4](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-customers-1920px.png)
- [معاينة 5](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-items-1280px.png)
- [معاينة 6](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-items-1920px.png)
- [معاينة 7](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-suppliers-1280px.png)
- [معاينة 8](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-balances-suppliers-1920px.png)
- [معاينة 9](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-cashBoxes-1280px.png)
- [معاينة 10](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-cashBoxes-1920px.png)
- [معاينة 11](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-customers-1280px.png)
- [معاينة 12](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-customers-1920px.png)
- [معاينة 13](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-items-1280px.png)
- [معاينة 14](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-items-1920px.png)
- [معاينة 15](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-suppliers-1280px.png)
- [معاينة 16](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-suppliers-1920px.png)
- [معاينة 17](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-warehouses-1280px.png)
- [معاينة 18](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-data-warehouses-1920px.png)
- [معاينة 19](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-empty-sales-1280px.png)
- [معاينة 20](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-empty-sales-1920px.png)
- [معاينة 21](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-purchase-1280px.png)
- [معاينة 22](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-purchase-1920px.png)
- [معاينة 23](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-purchase_return-1280px.png)
- [معاينة 24](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-purchase_return-1920px.png)
- [معاينة 25](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-sale-1280px.png)
- [معاينة 26](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-sale-1920px.png)
- [معاينة 27](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-sale_return-1280px.png)
- [معاينة 28](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-sale_return-1920px.png)
- [معاينة 29](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-warehouse_transfer-1280px.png)
- [معاينة 30](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-warehouse_transfer-1920px.png)
- [معاينة 31](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-waste-1280px.png)
- [معاينة 32](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-invoices-waste-1920px.png)
- [معاينة 33](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-cashBoxes-1280px.png)
- [معاينة 34](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-cashBoxes-1920px.png)
- [معاينة 35](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-customers-1280px.png)
- [معاينة 36](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-customers-1920px.png)
- [معاينة 37](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-items-1280px.png)
- [معاينة 38](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-items-1920px.png)
- [معاينة 39](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-reconciliations-1280px.png)
- [معاينة 40](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-reconciliations-1920px.png)
- [معاينة 41](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-suppliers-1280px.png)
- [معاينة 42](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-suppliers-1920px.png)
- [معاينة 43](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-users-1280px.png)
- [معاينة 44](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-management-users-1920px.png)
- [معاينة 45](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-receipts-cash_box_transfer-1280px.png)
- [معاينة 46](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-receipts-cash_box_transfer-1920px.png)
- [معاينة 47](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-receipts-in-1280px.png)
- [معاينة 48](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-receipts-in-1920px.png)
- [معاينة 49](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-receipts-out-1280px.png)
- [معاينة 50](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-receipts-out-1920px.png)
- [معاينة 51](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-statement-cashBoxes-1280px.png)
- [معاينة 52](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-statement-cashBoxes-1920px.png)
- [معاينة 53](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-statement-customers-1280px.png)
- [معاينة 54](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-statement-customers-1920px.png)
- [معاينة 55](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-statement-items-1280px.png)
- [معاينة 56](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-statement-items-1920px.png)
- [معاينة 57](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-stress-in-1280px.png)
- [معاينة 58](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-stress-in-1320px.png)
- [معاينة 59](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-stress-in-1920px.png)
- [معاينة 60](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-stress-out-1280px.png)
- [معاينة 61](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-stress-out-1320px.png)
- [معاينة 62](D:/Work/Coding/AI/MaksabPlus/docs/screenshots/compact-dates-actions-stress-out-1920px.png)
