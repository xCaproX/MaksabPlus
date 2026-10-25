import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import * as z from "zod"
import { type ColumnDef } from "@tanstack/react-table"
import { toast } from "sonner"
import {
  PlusIcon,
  DownloadIcon,
  FilterIcon,
  SearchIcon,
  BellIcon,
} from "lucide-react"

// UI Primitives
import { Button, IconButton } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { NumberInput } from "@/components/ui/number-input"
import { MoneyDisplay } from "@/components/ui/money-display"
import { DateInput } from "@/components/ui/date-input"
import { Badge, StatusBadge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Combobox } from "@/components/ui/combobox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Toaster } from "@/components/ui/sonner"

// App Components
import { RowActions } from "@/components/app/RowActions"
import { DataTable } from "@/components/app/DataTable"
import { PageLayout, DetailPanel } from "@/components/app/PageLayout"

// Form Schema
const testFormSchema = z.object({
  fullName: z.string().min(3, "الاسم يجب أن يحتوي على 3 أحرف على الأقل"),
  notes: z.string().optional(),
  notify: z.boolean().default(true),
})

type TestFormValues = z.infer<typeof testFormSchema>

// Table Sample Data Interface
interface SampleInvoice {
  id: string
  invoiceNumber: string
  customer: string
  date: string
  total: number
  status: "paid" | "partial" | "unpaid"
  notes?: string
}

const sampleData: SampleInvoice[] = [
  { id: "1", invoiceNumber: "SAL-000001", customer: "شركة الأمل للتجارة", date: "2026-10-01", total: 12500, status: "paid", notes: "تم التسليم بالكامل" },
  { id: "2", invoiceNumber: "SAL-000002", customer: "مؤسسة النور والهدى", date: "2026-10-03", total: 4320.5, status: "partial", notes: "متبقي دفعة ثانية" },
  { id: "3", invoiceNumber: "SAL-000003", customer: "محلات البركة", date: "2026-10-05", total: 890, status: "unpaid", notes: "استحقاق 30 يوم" },
  { id: "4", invoiceNumber: "SAL-000004", customer: "شركة دلتا مصر", date: "2026-10-07", total: 25400, status: "paid", notes: "تحويل بنكي" },
  { id: "5", invoiceNumber: "SAL-000005", customer: "المهندس أحمد توفيق", date: "2026-10-08", total: 1500, status: "paid", notes: "نقدي" },
  { id: "6", invoiceNumber: "SAL-000006", customer: "مكتبة الشرق الأوسط", date: "2026-10-10", total: 6780, status: "partial", notes: "شيك مؤجل" },
  { id: "7", invoiceNumber: "SAL-000007", customer: "مستشفى الشفاء التخصصي", date: "2026-10-12", total: 45000, status: "paid", notes: "أمر توريد حكومي" },
  { id: "8", invoiceNumber: "SAL-000008", customer: "سوبر ماركت الفيروز", date: "2026-10-14", total: 3200, status: "unpaid", notes: "تذكير هاتفي" },
  { id: "9", invoiceNumber: "SAL-000009", customer: "مطاعم الشام الحديثة", date: "2026-10-16", total: 18450.75, status: "paid", notes: "دفع كاشير" },
  { id: "10", invoiceNumber: "SAL-000010", customer: "صيدلية المستقبل", date: "2026-10-18", total: 2900, status: "partial", notes: "خصم كمية" },
  { id: "11", invoiceNumber: "SAL-000011", customer: "توكيل السلام للسيارات", date: "2026-10-20", total: 11200, status: "unpaid", notes: "متابعة مع الحسابات" },
  { id: "12", invoiceNumber: "SAL-000012", customer: "معرض النخيل للأثاث", date: "2026-10-22", total: 38000, status: "paid", notes: "دفعة نهائية" },
]

export default function DevComponents() {
  // State
  const [numVal, setNumVal] = React.useState<number | null>(1500.5)
  const [dateVal, setDateVal] = React.useState<string | null>("2026-10-25")
  const [comboboxVal, setComboboxVal] = React.useState<string | null>("item-2")
  const [selectedInvoice, setSelectedInvoice] = React.useState<SampleInvoice | null>(sampleData[0])
  const [isDetailOpen, setIsDetailOpen] = React.useState(true)
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [switchChecked, setSwitchChecked] = React.useState(true)
  const [checkboxChecked, setCheckboxChecked] = React.useState(true)

  // React Hook Form
  const form = useForm<TestFormValues>({
    resolver: zodResolver(testFormSchema),
    defaultValues: {
      fullName: "محمد أحمد علي",
      notes: "ملاحظات إضافية على النموذج المشترك",
      notify: true,
    },
  })

  const onSubmit = (values: TestFormValues) => {
    toast.success(`تم حفظ النموذج بنجاح: ${values.fullName}`)
  }

  // Table Columns
  const columns = React.useMemo<ColumnDef<SampleInvoice, any>[]>(
    () => [
      {
        accessorKey: "invoiceNumber",
        header: "رقم الفاتورة",
        meta: { priority: "high" },
        cell: ({ row }) => (
          <span className="font-mono font-semibold text-primary">
            {row.original.invoiceNumber}
          </span>
        ),
      },
      {
        accessorKey: "customer",
        header: "العميل",
        meta: { priority: "high" },
        cell: ({ row }) => (
          <div className="flex flex-col">
            <span className="font-medium text-foreground">{row.original.customer}</span>
            <span className="text-xs text-muted-foreground">{row.original.notes}</span>
          </div>
        ),
      },
      {
        accessorKey: "date",
        header: "التاريخ",
        meta: { priority: "medium" },
        cell: ({ row }) => (
          <span className="font-mono text-muted-foreground">{row.original.date}</span>
        ),
      },
      {
        accessorKey: "status",
        header: "حالة السداد",
        meta: { priority: "high" },
        cell: ({ row }) => {
          const s = row.original.status
          const label = s === "paid" ? "خالص" : s === "partial" ? "جزئي" : "غير مسدد"
          return <StatusBadge status={s}>{label}</StatusBadge>
        },
      },
      {
        accessorKey: "total",
        header: "الإجمالي",
        meta: { priority: "high", isNumeric: true },
        cell: ({ row }) => <MoneyDisplay amount={row.original.total} size="sm" />,
      },
      {
        id: "actions",
        header: "",
        meta: { priority: "high" },
        cell: ({ row }) => (
          <div className="flex justify-end" onClick={(e) => e.stopPropagation()}>
            <RowActions
              recordNumber={row.original.invoiceNumber}
              onEdit={() => {
                toast.info(`تعديل ${row.original.invoiceNumber}`)
              }}
              onDelete={() => {
                toast.error(`تم حذف ${row.original.invoiceNumber}`)
              }}
            />
          </div>
        ),
      },
    ],
    []
  )

  const grandTotal = React.useMemo(() => {
    return sampleData.reduce((acc, row) => acc + row.total, 0)
  }, [])

  return (
    <TooltipProvider>
      <div dir="rtl" className="min-h-screen bg-background font-sans text-foreground">
        <Toaster position="bottom-left" />

        {/* Global Nav for Showcase */}
        <div className="border-b border-border bg-card px-6 py-3 shadow-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex size-7 items-center justify-center rounded-md bg-primary text-primary-foreground font-bold text-xs">
                ERP
              </span>
              <span className="font-bold text-base">مكسب بلس — استعراض مكونات الأساس (Phase 1)</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  toast.success("تم إرسال إشعار تجريبي")
                }}
              >
                <BellIcon className="size-3.5 me-1" />
                إشعار Sonner
              </Button>
              <Button
                variant="destructive-outline"
                size="sm"
                onClick={() => setConfirmOpen(true)}
              >
                فتح ConfirmDialog
              </Button>
            </div>
          </div>
        </div>

        {/* Master-Detail PageLayout Showcase */}
        <PageLayout
          title="فواتير المبيعات"
          subtitle="إدارة ومتابعة فواتير العملاء وسندات القبض وحالات السداد"
          primaryAction={
            <Button variant="primary">
              <PlusIcon className="size-4 me-1.5" />
              فاتورة جديدة
            </Button>
          }
          secondaryActions={
            <>
              <Button variant="outline" size="md">
                <DownloadIcon className="size-4 me-1.5" />
                تصدير Excel
              </Button>
              <Button
                variant={isDetailOpen ? "secondary" : "outline"}
                size="md"
                onClick={() => setIsDetailOpen(!isDetailOpen)}
              >
                <FilterIcon className="size-4 me-1.5" />
                {isDetailOpen ? "إخفاء التفاصيل" : "عرض التفاصيل"}
              </Button>
            </>
          }
          filterBar={
            <div className="flex w-full flex-wrap items-center justify-between gap-3 text-sm">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="relative w-64">
                  <SearchIcon className="absolute top-2.5 start-2.5 size-4 text-muted-foreground" />
                  <Input placeholder="بحث برقم الفاتورة أو العميل..." className="ps-8 h-9" />
                </div>
                <Select defaultValue="all">
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">جميع الحالات</SelectItem>
                    <SelectItem value="paid">خالص</SelectItem>
                    <SelectItem value="partial">جزئي</SelectItem>
                    <SelectItem value="unpaid">غير مسدد</SelectItem>
                  </SelectContent>
                </Select>
                <div className="w-44">
                  <DateInput value={dateVal} onChange={setDateVal} placeholder="من تاريخ" />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">تصفية سريعة:</span>
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">اليوم</Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">هذا الأسبوع</Badge>
                <Badge variant="outline" className="cursor-pointer hover:bg-muted">هذا الشهر</Badge>
              </div>
            </div>
          }
          isDetailOpen={isDetailOpen}
          detailPanel={
            <DetailPanel
              title={selectedInvoice ? selectedInvoice.invoiceNumber : "تفاصيل الفاتورة"}
              subtitle={selectedInvoice ? selectedInvoice.customer : "اختر فاتورة من الجدول"}
              onClose={() => setIsDetailOpen(false)}
              footer={
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">الإجمالي النهائي:</span>
                    <MoneyDisplay
                      amount={selectedInvoice ? selectedInvoice.total : 0}
                      size="lg"
                      tone="positive"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="primary" className="flex-1">
                      إضافة دفعة سداد
                    </Button>
                    <Button variant="outline">طباعة</Button>
                  </div>
                </div>
              }
            >
              {selectedInvoice ? (
                <div className="space-y-4 text-sm">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center justify-between pb-2 border-b border-border text-xs text-muted-foreground">
                      <span>حالة الفاتورة</span>
                      <StatusBadge status={selectedInvoice.status}>
                        {selectedInvoice.status === "paid" ? "خالص" : selectedInvoice.status === "partial" ? "جزئي" : "غير مسدد"}
                      </StatusBadge>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pt-2 text-xs">
                      <div>
                        <span className="text-muted-foreground block">تاريخ الإصدار:</span>
                        <span className="font-mono font-medium">{selectedInvoice.date}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block">طريقة الدفع:</span>
                        <span className="font-medium">نقدي / خزينة رئيسية</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="mb-2 font-bold text-xs text-muted-foreground">بنود الفاتورة (قائمة عناصر طويلة للتمرير)</h3>
                    <div className="space-y-2">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex items-center justify-between rounded-md border border-border bg-background p-2 text-xs"
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">صنف تجريبي {i + 1}</span>
                            <span className="text-muted-foreground">الكمية: {i + 2} قطعة</span>
                          </div>
                          <MoneyDisplay amount={(i + 1) * 350} size="sm" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  اختر فاتورة من الجدول لعرض تفاصيلها
                </div>
              )}
            </DetailPanel>
          }
        >
          <DataTable
            tableId="dev_invoices_table"
            columns={columns}
            data={sampleData}
            selectedRowId={selectedInvoice?.id}
            onRowClick={(row) => setSelectedInvoice(row)}
            detailOpen={isDetailOpen}
            totalsRow={
              <tr>
                <td colSpan={4} className="px-3 py-2.5 text-start font-bold">
                  الإجمالي العام لجميع الفواتير ({sampleData.length} فاتورة):
                </td>
                <td className="px-3 py-2.5 text-end font-mono">
                  <MoneyDisplay amount={grandTotal} size="md" tone="positive" />
                </td>
                <td></td>
              </tr>
            }
          />
        </PageLayout>

        {/* Primitives Showcase Section */}
        <div className="mx-auto max-w-[1800px] p-4 md:p-6 space-y-8">
          <div className="border-t border-border pt-6">
            <h2 className="text-lg font-bold text-foreground mb-4">
              معرض المكونات الأساسية وتنوع الحالات (Variants Showcase)
            </h2>
          </div>

          {/* 1. Buttons & Badges */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-bold text-sm text-foreground">1. الأزرار (Buttons & IconButtons)</h3>
              <div className="flex flex-wrap gap-2 items-center">
                <Button variant="primary">primary filled</Button>
                <Button variant="secondary">secondary outline</Button>
                <Button variant="ghost">ghost</Button>
                <Button variant="destructive-outline">destructive-outline</Button>
                <Button variant="destructive-solid">destructive-solid</Button>
              </div>
              <div className="flex flex-wrap gap-2 items-center pt-2">
                <Button size="xs">حجم xs</Button>
                <Button size="sm">حجم sm</Button>
                <Button size="md">حجم md</Button>
                <Button size="lg">حجم lg</Button>
                <IconButton aria-label="أيقونة مفردة" variant="outline">
                  <BellIcon className="size-4" />
                </IconButton>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-bold text-sm text-foreground">2. شارات الحالات المنفصلة (StatusBadge Tokens)</h3>
              <div className="flex flex-wrap gap-2.5 items-center">
                <StatusBadge status="paid">خالص (Paid - Green)</StatusBadge>
                <StatusBadge status="partial">جزئي (Partial - Amber)</StatusBadge>
                <StatusBadge status="unpaid">غير مسدد (Unpaid - Red)</StatusBadge>
                <StatusBadge status="linked">مرتبط (Linked - Blue)</StatusBadge>
                <StatusBadge status="neutral">محايد (Neutral - Gray)</StatusBadge>
              </div>
              <div className="pt-2 flex flex-wrap gap-2">
                <Badge variant="default">شارة عادية</Badge>
                <Badge variant="secondary">ثانوية</Badge>
                <Badge variant="outline">إطار خارجي</Badge>
                <Badge variant="ghost">شفافة</Badge>
              </div>
            </div>
          </section>

          {/* 2. Numeric & Money Display */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-bold text-sm text-foreground">3. حقل إدخال الأرقام (NumberInput with Fixed Unit)</h3>
              <p className="text-xs text-muted-foreground">
                يقبل الأرقام المشرقية ٠-٩ ويحولها فوراً، يحدد الكل عند التركيز، لا توجد أسهم spinner، والوحدة لاحقة ثابتة.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    الكمية (بالقطعة):
                  </label>
                  <NumberInput
                    value={numVal}
                    onChange={setNumVal}
                    unit="قطعة"
                    decimals={0}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">
                    الوزن (بالكيلو جرام):
                  </label>
                  <NumberInput
                    value={12.75}
                    unit="كجم"
                    decimals={2}
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                القيمة الرقمية الحالية: <span className="font-mono font-bold text-foreground">{numVal}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-4">
              <h3 className="font-bold text-sm text-foreground">4. عرض المبالغ المالية (MoneyDisplay)</h3>
              <p className="text-xs text-muted-foreground">
                الأرقام داخل عنصر bdi dir=ltr مع tabular-nums والعملة ج.م كعنصر منفصل بدون نصوص بين أقواس.
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 items-end">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">حجم sm:</span>
                  <MoneyDisplay amount={150.5} size="sm" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">حجم md:</span>
                  <MoneyDisplay amount={12450} size="md" tone="positive" />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">حجم lg:</span>
                  <MoneyDisplay amount={-350} size="lg" tone="negative" signed />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">حجم xl:</span>
                  <MoneyDisplay amount={98500} size="xl" tone="neutral" />
                </div>
              </div>
            </div>
          </section>

          {/* 3. DateInput & Combobox & Select */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="font-bold text-sm text-foreground">5. منتقي التاريخ (DateInput)</h3>
              <p className="text-xs text-muted-foreground">
                عرض وإدخال dd/mm/yyyy مع تقويم عربي يبدأ بالسبت ومخرج ISO yyyy-mm-dd.
              </p>
              <DateInput value={dateVal} onChange={setDateVal} />
              <div className="text-xs text-muted-foreground">
                قيمة الـ ISO: <span className="font-mono text-foreground font-semibold">{dateVal ?? "فارغ"}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="font-bold text-sm text-foreground">6. صندوق البحث والاختيار (Combobox)</h3>
              <p className="text-xs text-muted-foreground">
                بديل SearchableSelect، متوافق مع لوحة المفاتيح واللغة العربية.
              </p>
              <Combobox
                options={[
                  { value: "item-1", label: "شاشات سامسونج 32 بوصة", subLabel: "قسم الإلكترونيات", meta: "1,200 ج.م" },
                  { value: "item-2", label: "طابعة إبسون L3250", subLabel: "طابعات وأحبار", meta: "4,500 ج.م" },
                  { value: "item-3", label: "كابل HDMI بطول 3 متر", subLabel: "إكسسوارات", meta: "75 ج.م" },
                  { value: "item-4", label: "لوحة مفاتيح وماوس لاسلكي", subLabel: "إكسسوارات", meta: "350 ج.م" },
                ]}
                value={comboboxVal}
                onChange={setComboboxVal}
                placeholder="اختر صنفاً..."
              />
              <div className="text-xs text-muted-foreground">
                المحدد: <span className="font-mono text-foreground font-semibold">{comboboxVal}</span>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="font-bold text-sm text-foreground">7. النماذج (React Hook Form + Zod)</h3>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>اسم المستخدم</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="notes"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>ملاحظات (Textarea)</FormLabel>
                        <FormControl>
                          <Textarea placeholder="أدخل أية تفاصيل إضافية..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="flex items-center justify-between pt-1">
                    <Button type="submit" size="sm" variant="primary">
                      تحقق وحفظ
                    </Button>
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="chk-demo"
                        checked={checkboxChecked}
                        onCheckedChange={(val) => setCheckboxChecked(!!val)}
                      />
                      <label htmlFor="chk-demo" className="text-xs">تفعيل</label>
                    </div>
                  </div>
                </form>
              </Form>
            </div>
          </section>

          {/* 4. Dialog & Tooltip & Controls */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="font-bold text-sm text-foreground">8. النوافذ المنبثقة (Dialog & Popover)</h3>
              <div className="flex flex-wrap gap-2">
                <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                  <DialogTrigger
                    render={<Button variant="outline">فتح نافذة Dialog</Button>}
                  />
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>عنوان نافذة الحوار</DialogTitle>
                      <DialogDescription>
                        هذا نص وصفي لنافذة الحوار المنبثقة مع دعم كامل لاتجاه RTL والخط Cairo.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="py-2">
                      <Input placeholder="أدخل بيانات إضافية..." />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
                      <Button variant="primary" onClick={() => setDialogOpen(false)}>موافق</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>

                <Popover>
                  <PopoverTrigger
                    render={<Button variant="ghost">فتح Popover</Button>}
                  />
                  <PopoverContent className="w-64 p-3 text-xs space-y-2">
                    <p className="font-semibold text-foreground">محتوى عائم توضيحي</p>
                    <p className="text-muted-foreground">يمكن استخدام الـ Popover لعرض أدوات سريعة أو خيارات منبثقة.</p>
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="font-bold text-sm text-foreground">9. التلميحات والمفاتيح (Tooltip & Switch)</h3>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch
                    checked={switchChecked}
                    onCheckedChange={setSwitchChecked}
                    id="switch-demo"
                  />
                  <label htmlFor="switch-demo" className="text-xs font-medium">
                    {switchChecked ? "نشط" : "معطل"}
                  </label>
                </div>

                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button variant="outline" size="sm">
                        مرر الفأرة هنا
                      </Button>
                    }
                  />
                  <TooltipContent>
                    هذا تلميح توضيحي للأزرار
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card p-5 space-y-3">
              <h3 className="font-bold text-sm text-foreground">10. عناصر التحميل المؤقت (Skeleton)</h3>
              <div className="space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </div>
          </section>
        </div>

        {/* Global Confirm Dialog for Showcase */}
        <ConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          recordNumber="حذف الفاتورة SAL-000002"
          description="سيؤدي هذا الإجراء إلى حذف الفاتورة وجميع بنودها بشكل نهائي."
          onConfirm={() => {
            toast.error("تم تنفيذ أمر الحذف")
          }}
        />
      </div>
    </TooltipProvider>
  )
}
