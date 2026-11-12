# 1. المعمارية العامة للمشروع (System Overview)

## نظرة عامة
**مكسب بلس (Maksab Plus)** هو نظام إدارة موارد ومحاسبة سحابي متعدد المستأجرين (Multi-tenant SaaS ERP) موجه لأصحاب الأنشطة التجارية الصغيرة والمتوسطة، ومصمم خصيصاً لبيئة العمل المصرية والعربية بواجهة RTL كاملة، سريعة وبسيطة لا تتطلب دراية مسبقة بعلم المحاسبة.

---

## حزمة التقنيات (Tech Stack)

### 1. البنية الخلفية وقاعدة البيانات (Backend & Database)
- **Supabase / PostgreSQL**: محرك البيانات والمصادقة (Auth).
- **Row-Level Security (RLS)**: عزل بيانات الشركات بشكل كامل على مستوى كل استعلام.
- **PL/pgSQL Functions (RPCs)**: جميع العمليات الحسابية، ترحيل الفواتير، وحركات المخزون والمالية تُنفذ حصرياً داخل المعاملات (ACID Transactions) في قاعدة البيانات لمنع أي تضارب أو تلاعب.
- **Supabase Edge Functions (Deno)**: دالة `manage-users` لإدارة دعوة الموظفين وتغيير كلمات مرورهم بأمان من قِبل المالك فقط.

### 2. الواجهة الأمامية (Frontend)
- **React 18** مع **Vite** و **TypeScript**.
- **React Router DOM v6**: للتوجيه وإدارة الصفحات وحمايتها.
- **Lucide React**: حزمة الأيقونات القياسية.
- **Chart.js**: رسوم بيانية تفاعلية في لوحة التحكم مع خطوط نبض خفيفة (`SparklineSvg`).
- **write-excel-file**: تصدير الجداول وكشوف الحساب إلى ملفات Excel.
- **Pure CSS / Modular Design System**: تصميم مبني على CSS Variables و Design Tokens مخصص للمشروع يدعم RTL بالكامل والخصائص المنطقية (`inline-start`/`inline-end`) دون مكتبات UI ثقيلة لضمان أعلى سرعة استجابة.

### 3. الاختبارات وضمان الجودة (Quality Assurance)
- **Vitest & React Testing Library** (53 ملف اختبار): لاختبارات الفرونت إند والمكونات وحسابات الفواتير والفلاتر.
- **PGlite (Postgres WASM)** (70 ملف اختبار SQL عبر `npm run test:db`): لاختبار جميع الـ 84 هجرة ودوال SQL محلياً في بيئة مطابقة لقاعدة بيانات الإنتاج.
- **Node Tests & Verification Scripts**: اختبارات `manage-users.test.mjs` و `verify-remote-db.test.mjs` و `free-receipt-concurrency.mjs` و `scripts/test-concurrency.mjs`، بالإضافة إلى `supabase/verify-remote-db.mjs` لفحص قاعدة البيانات السحابية.
- **ESLint & TypeScript**: للفحص الثابت (`tsc --noEmit`, `eslint src`).

---

## هيكل المجلدات الرئيسي (Directory Structure)

```text
MaksabPlus/
├── src/                          # كود الواجهة الأمامية
│   ├── components/               # المكونات المشتركة والنماذج (InvoiceForm, ReceiptForm, ...)
│   │   ├── charts/               # مكونات الرسوم البيانية للوحة التحكم (Chart.js + SparklineSvg)
│   │   └── invoice-form/         # وحدات نموذج الفاتورة الموحد (رأس الحساب، جدول الأصناف، الملخص)
│   ├── context/                  # سياقات إدارة الحالة المشتركة (MasterDataContext)
│   ├── lib/                      # دوال المنطق، التنسيق، الصلاحيات، الفلاتر، والتصدير
│   ├── pages/                    # الشاشات الرئيسية وتبويباتها
│   │   ├── home/                 # مكونات لوحة التحكم الرئيسية (بطاقات المبيعات، النبض المالي، القوائم الأعلى)
│   │   ├── invoices/             # جداول ومؤشرات الفواتير والتحويلات المخزنية
│   │   ├── receipts/             # جداول ومؤشرات الإيصالات والتحويلات النقدية
│   │   ├── balances/             # تبويبات أرصدة العملاء والموردين والخزن والأصناف
│   │   ├── master-data/          # تبويبات البيانات الأساسية (الحسابات، الأصناف، المخازن، الخزن)
│   │   └── management/           # تبويبات الأرصدة الافتتاحية، سجل المطابقات، وإدارة المستخدمين
│   ├── styles/                   # ملفات CSS المنظمة (tokens, base, layout, components/, pages/)
│   ├── test/                     # اختبارات الفرونت إند (Vitest)
│   ├── App.tsx                   # نقطة التوجيه الرئيسية والتحقق من الجلسات
│   └── main.tsx                  # نقطة انطلاق تطبيق React
├── supabase/                     # إعدادات وهجرات واختبارات قاعدة البيانات
│   ├── functions/                # دوال Edge Functions (manage-users)
│   ├── migrations/               # 84 ملف هجرة مرتبة بالتواريخ والأرقام التسلسلية
│   ├── tests/                    # 70 ملف اختبار SQL + fixtures + بيئة PGlite المحلية
│   └── verify-remote-db.mjs      # سكريبت التحقق من تكامل قاعدة البيانات السحابية
├── scripts/                      # سكريبتات التحقق من الواجهة والتخطيط والتزامن
├── docs/                         # التوثيق والتقارير
│   ├── architecture/             # الخريطة المعمارية الحية للنظام (هذا التوثيق)
│   └── screenshots/              # لقطات الشاشة لشاشات النظام بمقاسات RTL
├── package.json                  # إعدادات الحزم وسكريبتات المشروع
└── vite.config.ts                # إعدادات Vite
```

---

## مبادئ التصميم الأساسية (Core Design Principles)

1. **التعامل المالي في قاعدة البيانات (Single Source of Truth in Postgres)**:
   - الواجهة لا تحسب أرصدة ولا تحفظ إجماليات نهائية؛ قاعدة البيانات هي المرجع الوحيد لجميع العمليات المحاسبية.
2. **عزل المستأجرين الإجباري (Strict Multi-Tenancy)**:
   - كل جدول عمل يحمل `company_id uuid not null references companies(id)` مع سياسات RLS صارمة.
3. **التصميم الموحد للوثائق (Unified Document Architecture)**:
   - النموذج الواحد (مثل `InvoiceForm`) يُستخدم لإنشاء، تعديل، وعرض الوثيقة مع الحفاظ التام على ترتيب الحقول والمظهر عبر وضع القراءة فقط (`readOnly`).
4. **توقيت القاهرة الموحد وسلامة التزامن (Cairo Time & Concurrency Safety)**:
   - تعتمد كافة التواريخ الافتراضية ومؤشرات لوحة التحكم توقيت مصر (`Africa/Cairo`) عبر `cairo_today()`، وتُنفذ العمليات الحساسة بترتيب أقفال ثابت (`invoices -> accounts -> item_stock -> receipts -> cash_boxes`) وبمعرفات مرتبة تصاعدياً لمنع التعارض التزامني (`Deadlock 40P01`).
5. **بساطة وسرعة التجربة (Speed & Simplicity)**:
   - الكاشير يقف أمامه عميل؛ لذلك تم تقليل الخطوات، الحقول الإجبارية، وتم إخفاء التعقيد المحاسبي خلف الكواليس.
