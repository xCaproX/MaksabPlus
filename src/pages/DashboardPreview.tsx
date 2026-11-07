import { Activity, ArrowLeft, Package, RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import MoneyDisplay from '../components/MoneyDisplay';
import { useAccess } from '../lib/access';
import { errorMessage } from '../lib/errors';
import { qty } from '../lib/format';
import { supabase } from '../lib/supabase';
import FinancialPulseCards from './home/FinancialPulseCards';
import LowStockCard, { type LowStockItem } from './home/LowStockCard';
import type { DashboardSales } from './home/SalesMetricCards';
import TopRankedList from './home/TopRankedList';
import './dashboard-preview.css';

type Summary = {
  sales: DashboardSales | null;
  cash_balance: number | null;
  receivables_balance: number | null;
  payables_balance: number | null;
  top_items: Array<{ item_id: string; item_name: string; total_qty: number; unit: string }> | null;
  low_stock_items: LowStockItem[] | null;
  permissions: { can_view_sales: boolean; can_view_items: boolean };
};

const periods = [
  { key: 'today', label: 'اليوم', count: 'today_count' },
  { key: 'week', label: 'آخر أسبوع', count: 'week_count' },
  { key: 'month', label: 'آخر شهر', count: 'month_count' },
] as const;

export default function DashboardPreview() {
  const { access, loading: accessLoading } = useAccess();
  const role = access?.role;
  const [result, setResult] = useState<{ data: Summary | null; error: string | null } | null>(null);
  const [request, setRequest] = useState(0);
  const [period, setPeriod] = useState<(typeof periods)[number]>(periods[0]);

  useEffect(() => {
    if (!role) return;
    const controller = new AbortController();
    void supabase.rpc('get_home_dashboard_summary').abortSignal(controller.signal)
      .then(({ data, error }) => {
        if (controller.signal.aborted) return;
        setResult(error || !data
          ? { data: null, error: error ? errorMessage(error) : 'ملخص النشاط غير متاح حاليًا.' }
          : { data: data as Summary, error: null });
      });
    return () => controller.abort();
  }, [request, role]);

  if (!accessLoading && !role) return <Navigate to="/access-denied" replace />;

  function refresh() {
    setResult(null);
    setRequest((previous) => previous + 1);
  }

  const summary = result?.data;
  const sales = summary?.permissions.can_view_sales ? summary.sales : null;
  const invoiceCount = sales?.[period.count];
  const hasBalances = summary && [
    summary.cash_balance, summary.receivables_balance, summary.payables_balance,
  ].some((balance) => balance !== null);

  return (
    <div className="preview-dashboard" dir="rtl">
      <header className="preview-dashboard-header">
        <div>
          <span className="preview-dashboard-tag">لوحة تجريبية</span>
          <h1>نبض النشاط</h1>
          <p>تابع مبيعاتك وأرصدتك ونواقص المخزون في مكان واحد.</p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={refresh} disabled={!result}>
          <RefreshCw size={16} aria-hidden="true" /> تحديث البيانات
        </button>
      </header>

      {!result && <p className="card empty" role="status">جارٍ تحميل بيانات الشركة…</p>}
      {result?.error && <p className="card empty" role="alert">{result.error}</p>}

      {sales && (
        <section className="preview-dashboard-sales" aria-label="صافي المبيعات">
          <div className="preview-dashboard-sales-head">
            <h2><Activity size={20} aria-hidden="true" /> صافي المبيعات</h2>
            <div className="preview-dashboard-periods" role="group" aria-label="فترة المبيعات">
              {periods.map((option) => (
                <button key={option.key} type="button" aria-pressed={option.key === period.key} onClick={() => setPeriod(option)}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="preview-dashboard-sales-body" aria-live="polite">
            <div>
              <p>{period.label} · بعد خصم المرتجعات</p>
              <MoneyDisplay value={sales[period.key]} currency className="preview-dashboard-amount" />
            </div>
            {invoiceCount !== undefined && (
              <div className="preview-dashboard-count">
                <bdi dir="ltr" className="tabular-nums">{qty(invoiceCount)}</bdi>
                <span>فاتورة بيع</span>
              </div>
            )}
          </div>
          <Link className="preview-dashboard-sales-link" to="/invoices?tab=sale">
            عرض فواتير المبيعات <ArrowLeft size={15} aria-hidden="true" />
          </Link>
        </section>
      )}

      {summary && hasBalances && (
        <section className="preview-dashboard-balances" aria-label="الأرصدة الحالية">
          <h2>الأرصدة الحالية</h2>
          <FinancialPulseCards cashBalance={summary.cash_balance}
            receivablesBalance={summary.receivables_balance} payablesBalance={summary.payables_balance} />
        </section>
      )}

      {summary && (summary.permissions.can_view_sales || summary.permissions.can_view_items) && (
        <div className="preview-dashboard-insights">
          {summary.permissions.can_view_sales && (
            <TopRankedList
              title="الأصناف الأكثر مبيعًا خلال آخر شهر"
              icon={Package}
              items={(summary.top_items ?? []).map((item) => ({
                id: item.item_id, label: item.item_name, value: Number(item.total_qty),
                formattedValue: qty(item.total_qty), unit: item.unit,
              }))}
              barVariant="items"
              emptyText="مفيش مبيعات أصناف خلال آخر شهر."
              linkTo="/invoices?tab=sale"
              linkText="عرض فواتير المبيعات"
            />
          )}
          {summary.permissions.can_view_items && <LowStockCard items={summary.low_stock_items} />}
        </div>
      )}
      {summary && !sales && !hasBalances && !summary.permissions.can_view_sales && !summary.permissions.can_view_items && (
        <p className="card empty">مفيش مؤشرات متاحة لحسابك في اللوحة دي.</p>
      )}
    </div>
  );
}
