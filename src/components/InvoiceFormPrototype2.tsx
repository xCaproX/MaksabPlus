import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  Clock,
  Eye,
  EyeOff,
  FileSpreadsheet,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Trash2,
  TriangleAlert,
} from 'lucide-react';
import { round2, today } from '../lib/format';
import { calculateBalancePreview } from '../lib/invoiceMath';

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type PriceTier = 'showroom' | 'general' | 'agent' | 'wholesale';

export interface Inv2Item {
  id: string;
  code: string;
  name: string;
  unit: string;
  available: number;
  cost: number;
  showroomPrice: number;
}

export interface Inv2Account {
  id: string;
  kind: 'customer' | 'supplier';
  code: string;
  name: string;
  note?: string;
  phone?: string;
  /** موجب = عليه (مدين)، سالب = له — نفس اصطلاح calculateBalancePreview */
  balance: number;
}

export interface Inv2CashBox {
  id: string;
  name: string;
  balance: number;
}

interface Props {
  accounts: Inv2Account[];
  items: Inv2Item[];
  cashBoxes: Inv2CashBox[];
  warehouses: string[];
  onCancel?: () => void;
}

interface Line {
  key: string;
  itemId: string;
  qty: string;
  price: string;
  priceEdited: boolean;
  discount: string;
}

type DiscountMode = 'pct' | 'amt';

const TIERS: { id: PriceTier; label: string; factor: number }[] = [
  { id: 'showroom', label: 'المعرض', factor: 1 },
  { id: 'general', label: 'عام', factor: 0.96 },
  { id: 'agent', label: 'مندوب', factor: 0.92 },
  { id: 'wholesale', label: 'جملة', factor: 0.88 },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const fmt = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQty = new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 });

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

/** يقبل أرقام عربية وهندية، ويُبقي رقمًا عشريًا واحدًا فقط */
function cleanNumber(raw: string): string {
  const latin = raw
    .replace(/[٠-٩]/g, (d) => String(ARABIC_DIGITS.indexOf(d)))
    .replace(/٫/g, '.');
  let seenDot = false;
  let out = '';
  for (const ch of latin) {
    if (ch >= '0' && ch <= '9') out += ch;
    else if (ch === '.' && !seenDot) {
      seenDot = true;
      out += ch;
    }
  }
  return out;
}

function toNum(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function priceFor(item: Inv2Item, tier: PriceTier): string {
  const factor = TIERS.find((t) => t.id === tier)?.factor ?? 1;
  return round2(item.showroomPrice * factor).toFixed(2);
}

function optionLabel(item: Inv2Item): string {
  return `[${item.code}] ${item.name}`;
}

function balanceSide(value: number): string {
  if (value > 0) return 'عليه';
  if (value < 0) return 'له';
  return 'متزن';
}

function balanceText(value: number): string {
  if (value === 0) return '0.00 ج.م (متزن)';
  return `${fmt.format(Math.abs(value))} ج.م ${balanceSide(value)}`;
}

function selectOnFocus(event: React.FocusEvent<HTMLInputElement>) {
  event.currentTarget.select();
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function InvoiceFormPrototype2({ accounts, items, cashBoxes, warehouses, onCancel }: Props) {
  /* ----- party ----- */
  const [accountKind, setAccountKind] = useState<'customer' | 'supplier'>('customer');
  const [accountId, setAccountId] = useState(() => accounts.find((a) => a.kind === 'customer')?.id ?? '');
  const kindAccounts = useMemo(() => accounts.filter((a) => a.kind === accountKind), [accounts, accountKind]);
  const account = accounts.find((a) => a.id === accountId) ?? null;

  /* ----- header ----- */
  const [warehouse, setWarehouse] = useState(warehouses[0] ?? '');
  const [tier, setTier] = useState<PriceTier>('showroom');
  const [date, setDate] = useState(today());

  /* ----- lines ----- */
  const seq = useRef(0);
  const nextKey = () => `l${++seq.current}`;
  const [lines, setLines] = useState<Line[]>(() =>
    items.slice(0, 3).map((item, index) => ({
      key: `seed${index}`,
      itemId: item.id,
      qty: String([15, 5, 1][index] ?? 1),
      price: priceFor(item, 'showroom'),
      priceEdited: false,
      discount: '0',
    })),
  );
  const [query, setQuery] = useState('');
  const [showCost, setShowCost] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);
  const qtyRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => {
    const key = pendingFocus.current;
    if (!key) return;
    const el = qtyRefs.current[key];
    if (el) {
      el.focus();
      el.select();
    }
    pendingFocus.current = null;
  }, [lines]);

  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  function addItem(item: Inv2Item) {
    const existing = lines.find((l) => l.itemId === item.id);
    if (existing) {
      // نفس الصنف لا يتكرر في الفاتورة (قيد قاعدة البيانات 0036): نزوّد كميته
      pendingFocus.current = existing.key;
      setLines(lines.map((l) => (l.key === existing.key ? { ...l, qty: String(toNum(l.qty) + 1) } : l)));
      return;
    }
    const key = nextKey();
    pendingFocus.current = key;
    setLines([
      ...lines,
      { key, itemId: item.id, qty: '1', price: priceFor(item, tier), priceEdited: false, discount: '0' },
    ]);
  }

  function resolveQuery(value: string): Inv2Item | null {
    const text = value.trim();
    if (!text) return null;
    const exact = items.find((i) => optionLabel(i) === text || i.code === text);
    if (exact) return exact;
    const matches = items.filter((i) => i.name.includes(text) || i.code.includes(text));
    return matches.length === 1 ? matches[0] : null;
  }

  function onQueryChange(value: string) {
    const hit = items.find((i) => optionLabel(i) === value);
    if (hit) {
      addItem(hit);
      setQuery('');
    } else {
      setQuery(value);
    }
  }

  function onQueryKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const hit = resolveQuery(query);
    if (hit) {
      addItem(hit);
      setQuery('');
    }
  }

  function updateLine(key: string, patch: Partial<Line>) {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function removeLine(key: string) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  function changeTier(next: PriceTier) {
    setTier(next);
    // الأسعار التي لم يعدّلها الكاشير يدويًا تتبع الفئة الجديدة
    setLines((prev) =>
      prev.map((l) => {
        const item = itemById.get(l.itemId);
        return item && !l.priceEdited ? { ...l, price: priceFor(item, next) } : l;
      }),
    );
  }

  function changeKind(kind: 'customer' | 'supplier') {
    setAccountKind(kind);
    setAccountId(accounts.find((a) => a.kind === kind)?.id ?? '');
  }

  /* ----- discount / tax / payment ----- */
  const [discountMode, setDiscountMode] = useState<DiscountMode>('amt');
  const [discountRaw, setDiscountRaw] = useState('12.50');
  const [taxPct, setTaxPct] = useState('0');
  const [paid, setPaid] = useState('1000');
  const [cashBoxId, setCashBoxId] = useState(cashBoxes[0]?.id ?? '');
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  /* ----- calculations (التقريب لكل صف أولًا ليتطابق المجموع مع المعروض) ----- */
  const calc = useMemo(() => {
    const rows = lines.map((l) => {
      const qty = toNum(l.qty);
      const price = toNum(l.price);
      const disc = Math.min(100, Math.max(0, toNum(l.discount)));
      const netUnit = round2(price * (1 - disc / 100));
      const total = round2(netUnit * qty);
      return { key: l.key, qty, price, netUnit, total };
    });
    const subtotal = round2(rows.reduce((sum, r) => sum + r.total, 0));

    const rawDiscount = toNum(discountRaw);
    const discountAmount =
      discountMode === 'pct'
        ? round2((subtotal * Math.min(100, rawDiscount)) / 100)
        : round2(Math.min(subtotal, rawDiscount));
    const discountPct =
      discountMode === 'pct' ? Math.min(100, rawDiscount) : subtotal > 0 ? (discountAmount / subtotal) * 100 : 0;

    const afterDiscount = round2(subtotal - discountAmount);
    const taxAmount = round2((afterDiscount * toNum(taxPct)) / 100);
    const net = round2(afterDiscount + taxAmount);
    const paidNum = toNum(paid);
    const remaining = round2(net - paidNum);
    return { rows, subtotal, discountAmount, discountPct, afterDiscount, taxAmount, net, paidNum, remaining };
  }, [lines, discountRaw, discountMode, taxPct, paid]);

  const balance = useMemo(
    () =>
      calculateBalancePreview({
        currentAccountBalance: account?.balance ?? 0,
        isReturn: false,
        total: calc.net,
        paid: calc.paidNum,
      }),
    [account, calc.net, calc.paidNum],
  );

  const hasInvalidQty = calc.rows.some((r) => r.qty <= 0);
  const canSave = lines.length > 0 && !hasInvalidQty && calc.net >= 0;
  const cashBox = cashBoxes.find((c) => c.id === cashBoxId) ?? null;

  /* ----- actions ----- */
  function save() {
    if (!canSave) return;
    setSaved(true);
    setNotice('تم الحفظ — معاينة فقط، لم يُرسل شيء لقاعدة البيانات.');
  }

  function hold() {
    setNotice('تم تعليق الفاتورة — معاينة فقط.');
  }

  function clearAll() {
    setLines([]);
    setDiscountMode('amt');
    setDiscountRaw('0');
    setPaid('0');
    setNotes('');
    setSaved(false);
    setNotice(null);
    searchRef.current?.focus();
  }

  const actionsRef = useRef({ save, hold, clearAll });
  useEffect(() => {
    actionsRef.current = { save, hold, clearAll };
  });

  useEffect(() => {
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.key === 'F2') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'F4') {
        event.preventDefault();
        actionsRef.current.hold();
      } else if (event.key === 'F8') {
        event.preventDefault();
        actionsRef.current.clearAll();
      } else if (event.key === 'F9') {
        event.preventDefault();
        actionsRef.current.save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ----- derived display ----- */
  const discountPctShown = discountMode === 'pct' ? discountRaw : calc.discountPct.toFixed(2);
  const discountAmtShown = discountMode === 'amt' ? discountRaw : calc.discountAmount.toFixed(2);
  const remainingTone = calc.remaining > 0 ? 'due' : calc.remaining < 0 ? 'over' : 'zero';
  const columnCount = showCost ? 10 : 9;

  return (
    <div className="inv2">
      {/* ================= main column ================= */}
      <div className="inv2-main">
        {/* ---- party ---- */}
        <section className="inv2-card" aria-label="بيانات العميل">
          <div className="inv2-party-row">
            <label className="inv2-field inv2-field--kind">
              <span>نوع الحساب</span>
              <select value={accountKind} onChange={(e) => changeKind(e.target.value as 'customer' | 'supplier')}>
                <option value="customer">عميل</option>
                <option value="supplier">مورد</option>
              </select>
            </label>

            <label className="inv2-field inv2-field--account">
              <span>{accountKind === 'customer' ? 'العميل' : 'المورد'}</span>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {kindAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    [{a.code}] {a.name}
                    {a.note ? ` — ${a.note}` : ''}
                    {a.phone ? ` — ${a.phone}` : ''}
                  </option>
                ))}
              </select>
            </label>

            <button type="button" className="inv2-btn inv2-btn--icon" aria-label="إضافة حساب جديد" title="إضافة حساب جديد">
              <Plus size={18} />
            </button>
          </div>

          <div className="inv2-balance" aria-live="polite">
            <span className="inv2-balance-label">رصيد الحساب الآن</span>
            <strong dir="ltr">{balanceText(balance.balanceBefore)}</strong>
            <span className="inv2-balance-arrow" aria-hidden="true">←</span>
            <span className="inv2-balance-label">بعد هذه الفاتورة</span>
            <strong dir="ltr">{balanceText(balance.balanceAfter)}</strong>
            {balance.netInvoiceDebt !== 0 && (
              <span className={`inv2-balance-delta${balance.netInvoiceDebt > 0 ? ' is-up' : ''}`} dir="ltr">
                ({balance.netInvoiceDebt > 0 ? '+' : '−'}
                {fmt.format(Math.abs(balance.netInvoiceDebt))})
              </span>
            )}
          </div>

          <div className="inv2-party-row">
            <label className="inv2-field inv2-field--wh">
              <span>المخزن المنصرف منه</span>
              <select value={warehouse} onChange={(e) => setWarehouse(e.target.value)}>
                {warehouses.map((w) => (
                  <option key={w} value={w}>
                    {w}
                  </option>
                ))}
              </select>
            </label>

            <label className="inv2-field inv2-field--date">
              <span>تاريخ الفاتورة</span>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)} dir="ltr" />
            </label>

            <div className="inv2-field inv2-field--tier">
              <span id="inv2-tier-label">قائمة الأسعار</span>
              <div className="inv2-seg" role="radiogroup" aria-labelledby="inv2-tier-label">
                {TIERS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    role="radio"
                    aria-checked={tier === t.id}
                    className={tier === t.id ? 'is-active' : ''}
                    onClick={() => changeTier(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---- items ---- */}
        <section className="inv2-card inv2-card--table" aria-label="أصناف الفاتورة">
          <div className="inv2-card-head">
            <h3>
              الأصناف <span className="inv2-count">{lines.length}</span>
            </h3>
            <span className="inv2-hint">الأسعار والإجماليات بالجنيه المصري (ج.م)</span>
            <button
              type="button"
              className="inv2-btn inv2-btn--ghost inv2-btn--sm"
              aria-pressed={showCost}
              onClick={() => setShowCost((v) => !v)}
            >
              {showCost ? <EyeOff size={14} /> : <Eye size={14} />}
              {showCost ? 'إخفاء التكلفة' : 'إظهار التكلفة'}
            </button>
          </div>

          <div className="inv2-scroll">
            <table className="inv2-table">
              <thead>
                <tr>
                  <th className="col-idx">#</th>
                  <th className="col-item">الصنف</th>
                  <th className="col-num">المتاح</th>
                  {showCost && <th className="col-num">التكلفة</th>}
                  <th className="col-in">السعر</th>
                  <th className="col-in">الكمية</th>
                  <th className="col-in col-disc">خصم %</th>
                  <th className="col-num">الصافي</th>
                  <th className="col-total">الإجمالي</th>
                  <th className="col-del">
                    <span className="inv2-sr">حذف</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line, index) => {
                  const item = itemById.get(line.itemId);
                  const row = calc.rows[index];
                  if (!item || !row) return null;
                  const overStock = row.qty > item.available;
                  const belowCost = showCost && row.price < item.cost;
                  return (
                    <tr key={line.key} className={overStock ? 'has-warn' : ''}>
                      <td className="col-idx">{index + 1}</td>
                      <td className="col-item">
                        <div className="inv2-item">
                          <span className="inv2-item-name">{item.name}</span>
                          <span className="inv2-item-meta">
                            {item.code} · {item.unit}
                          </span>
                          {overStock && (
                            <span className="inv2-item-warn" role="alert">
                              <TriangleAlert size={12} aria-hidden="true" /> الكمية أكبر من المتاح ({fmtQty.format(item.available)})
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="col-num" dir="ltr">
                        <span className="inv2-muted">{fmtQty.format(item.available)}</span>
                      </td>
                      {showCost && (
                        <td className="col-num" dir="ltr">
                          <span className="inv2-muted">{fmt.format(item.cost)}</span>
                        </td>
                      )}
                      <td className="col-in">
                        <input
                          className={belowCost ? 'is-warn' : ''}
                          aria-label={`سعر ${item.name}`}
                          aria-invalid={belowCost || undefined}
                          title={belowCost ? 'السعر أقل من التكلفة' : undefined}
                          inputMode="decimal"
                          dir="ltr"
                          value={line.price}
                          onFocus={selectOnFocus}
                          onChange={(e) => updateLine(line.key, { price: cleanNumber(e.target.value), priceEdited: true })}
                        />
                      </td>
                      <td className="col-in">
                        <input
                          ref={(el) => {
                            qtyRefs.current[line.key] = el;
                          }}
                          className="is-strong"
                          aria-label={`كمية ${item.name}`}
                          aria-invalid={overStock || undefined}
                          inputMode="decimal"
                          dir="ltr"
                          value={line.qty}
                          onFocus={selectOnFocus}
                          onChange={(e) => updateLine(line.key, { qty: cleanNumber(e.target.value) })}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              searchRef.current?.focus();
                            }
                          }}
                        />
                      </td>
                      <td className="col-in col-disc">
                        <input
                          aria-label={`خصم ${item.name}`}
                          inputMode="decimal"
                          dir="ltr"
                          value={line.discount}
                          onFocus={selectOnFocus}
                          onChange={(e) => updateLine(line.key, { discount: cleanNumber(e.target.value) })}
                        />
                      </td>
                      <td className="col-num" dir="ltr">
                        <span className="inv2-calc">{fmt.format(row.netUnit)}</span>
                      </td>
                      <td className="col-total" dir="ltr">
                        <span className="inv2-calc inv2-calc--strong">{fmt.format(row.total)}</span>
                      </td>
                      <td className="col-del">
                        <button
                          type="button"
                          className="inv2-del"
                          aria-label={`حذف ${item.name}`}
                          title="حذف الصنف"
                          onClick={() => removeLine(line.key)}
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}

                {/* الصف النشط: بحث/باركود ثم Enter */}
                <tr className="inv2-row-new">
                  <td className="col-idx">{lines.length + 1}</td>
                  <td colSpan={columnCount - 1}>
                    <input
                      ref={searchRef}
                      list="inv2-items"
                      className="inv2-search"
                      aria-label="إضافة صنف"
                      placeholder="اكتب اسم الصنف أو الكود أو امسح الباركود، ثم Enter  (F2)"
                      value={query}
                      onChange={(e) => onQueryChange(e.target.value)}
                      onKeyDown={onQueryKeyDown}
                      autoComplete="off"
                    />
                    <datalist id="inv2-items">
                      {items.map((i) => (
                        <option key={i.id} value={optionLabel(i)}>
                          {`المتاح ${fmtQty.format(i.available)} ${i.unit}`}
                        </option>
                      ))}
                    </datalist>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* ================= summary column ================= */}
      <aside className="inv2-summary" aria-label="ملخص الفاتورة">
        <div className="inv2-sum-card">
          <div className="inv2-sum-row">
            <span>الإجمالي</span>
            <strong dir="ltr">{fmt.format(calc.subtotal)}</strong>
          </div>

          <div className="inv2-sum-row inv2-sum-row--inputs">
            <span>الخصم</span>
            <div className="inv2-pair">
              <label>
                <input
                  aria-label="نسبة الخصم"
                  inputMode="decimal"
                  dir="ltr"
                  value={discountPctShown}
                  onFocus={(e) => {
                    selectOnFocus(e);
                    if (discountMode !== 'pct') {
                      setDiscountMode('pct');
                      setDiscountRaw(calc.discountPct.toFixed(2));
                    }
                  }}
                  onChange={(e) => {
                    setDiscountMode('pct');
                    setDiscountRaw(cleanNumber(e.target.value));
                  }}
                />
                <em>%</em>
              </label>
              <label>
                <input
                  aria-label="قيمة الخصم"
                  inputMode="decimal"
                  dir="ltr"
                  value={discountAmtShown}
                  onFocus={(e) => {
                    selectOnFocus(e);
                    if (discountMode !== 'amt') {
                      setDiscountMode('amt');
                      setDiscountRaw(calc.discountAmount.toFixed(2));
                    }
                  }}
                  onChange={(e) => {
                    setDiscountMode('amt');
                    setDiscountRaw(cleanNumber(e.target.value));
                  }}
                />
                <em>ج.م</em>
              </label>
            </div>
          </div>

          <div className="inv2-sum-row inv2-sum-row--inputs">
            <span>الضريبة</span>
            <div className="inv2-pair">
              <label>
                <input
                  aria-label="نسبة الضريبة"
                  inputMode="decimal"
                  dir="ltr"
                  value={taxPct}
                  onFocus={selectOnFocus}
                  onChange={(e) => setTaxPct(cleanNumber(e.target.value))}
                />
                <em>%</em>
              </label>
              <label>
                <input aria-label="قيمة الضريبة" dir="ltr" value={fmt.format(calc.taxAmount)} readOnly tabIndex={-1} className="is-calc" />
                <em>ج.م</em>
              </label>
            </div>
          </div>

          <div className="inv2-net">
            <span>الصافي</span>
            <strong dir="ltr">
              {fmt.format(calc.net)} <small>ج.م</small>
            </strong>
          </div>

          <div className="inv2-pay">
            <div className="inv2-pay-head">
              <label htmlFor="inv2-paid">المدفوع</label>
              <div className="inv2-pay-quick">
                <button type="button" className="inv2-btn inv2-btn--ghost inv2-btn--sm" onClick={() => setPaid(calc.net.toFixed(2))}>
                  دفع بالكامل
                </button>
                <button type="button" className="inv2-btn inv2-btn--ghost inv2-btn--sm" onClick={() => setPaid('0')}>
                  آجل بالكامل
                </button>
              </div>
            </div>
            <input
              id="inv2-paid"
              className="inv2-paid"
              inputMode="decimal"
              dir="ltr"
              value={paid}
              onFocus={selectOnFocus}
              onChange={(e) => setPaid(cleanNumber(e.target.value))}
            />
          </div>

          <div className={`inv2-remaining is-${remainingTone}`}>
            <span>{remainingTone === 'over' ? 'زيادة عن الصافي' : remainingTone === 'due' ? 'المتبقي (آجل)' : 'المتبقي'}</span>
            <strong dir="ltr">
              {fmt.format(Math.abs(calc.remaining))} <small>ج.م</small>
            </strong>
          </div>
          {remainingTone === 'over' && (
            <p className="inv2-note-warn" role="alert">
              المدفوع أكبر من الصافي. راجع المبلغ قبل الحفظ.
            </p>
          )}

          <label className="inv2-field inv2-field--safe">
            <span>الخزنة المستلمة</span>
            <select value={cashBoxId} onChange={(e) => setCashBoxId(e.target.value)} disabled={calc.paidNum <= 0}>
              {cashBoxes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <small>
              {calc.paidNum <= 0 ? 'لا يوجد مبلغ مدفوع، فلا حاجة لخزنة.' : cashBox ? `رصيد الخزنة: ${fmt.format(cashBox.balance)} ج.م` : ''}
            </small>
          </label>

          {notesOpen ? (
            <label className="inv2-field">
              <span>ملاحظات</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="ملاحظات اختيارية على الفاتورة…" />
            </label>
          ) : (
            <button type="button" className="inv2-link" onClick={() => setNotesOpen(true)}>
              <Plus size={14} /> إضافة ملاحظة
            </button>
          )}
        </div>

        <div className="inv2-actions">
          {notice && (
            <p className="inv2-notice" role="status">
              {notice}
            </p>
          )}
          <button type="button" className="inv2-btn inv2-btn--primary inv2-btn--lg" onClick={save} disabled={!canSave}>
            <Save size={18} /> حفظ الفاتورة <kbd>F9</kbd>
          </button>
          <div className="inv2-actions-row">
            <button type="button" className="inv2-btn inv2-btn--outline" onClick={hold}>
              <Clock size={16} /> تعليق <kbd>F4</kbd>
            </button>
            <button type="button" className="inv2-btn inv2-btn--outline" onClick={clearAll}>
              <RotateCcw size={16} /> مسح / جديد <kbd>F8</kbd>
            </button>
          </div>
          <div className="inv2-print" role="group" aria-label="الطباعة والتصدير">
            <span>{saved ? 'طباعة' : 'الطباعة بعد الحفظ'}</span>
            <button type="button" className="inv2-btn inv2-btn--ghost inv2-btn--sm" disabled={!saved}>
              <Printer size={14} /> A4
            </button>
            <button type="button" className="inv2-btn inv2-btn--ghost inv2-btn--sm" disabled={!saved}>
              <Printer size={14} /> A5
            </button>
            <button type="button" className="inv2-btn inv2-btn--ghost inv2-btn--sm" disabled={!saved}>
              <Receipt size={14} /> ريسيت
            </button>
            <button type="button" className="inv2-btn inv2-btn--ghost inv2-btn--sm" disabled={!saved}>
              <FileSpreadsheet size={14} /> تصدير
            </button>
          </div>
          {onCancel && (
            <button type="button" className="inv2-link inv2-link--center" onClick={onCancel}>
              إغلاق
            </button>
          )}
        </div>
      </aside>

      {/* شريط ثابت على الشاشات الضيقة */}
      <div className="inv2-bar">
        <div>
          <span>الصافي</span>
          <strong dir="ltr">{fmt.format(calc.net)}</strong>
        </div>
        <div>
          <span>المتبقي</span>
          <strong dir="ltr">{fmt.format(calc.remaining)}</strong>
        </div>
        <button type="button" className="inv2-btn inv2-btn--primary" onClick={save} disabled={!canSave}>
          <Save size={16} /> حفظ
        </button>
      </div>
    </div>
  );
}
