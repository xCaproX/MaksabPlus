import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { ShoppingCart, ArrowDownLeft, ArrowUpRight, ShoppingBag } from 'lucide-react';
import { useAccess } from '../../lib/access';
import { creationDate, creationTime } from '../../lib/format';

interface QuickActionsProps {
  userName: string;
  companyName: string;
}

export default function QuickActions({ userName, companyName }: QuickActionsProps) {
  const { can, access } = useAccess();

  const isOwner = access?.role === 'owner';
  const canSale = isOwner || can('goods.sale.create', 'goods.sale.view', 'goods.view');
  const canReceiptIn = isOwner || can('money.in.create', 'money.in.view', 'money.view');
  const canReceiptOut = isOwner || can('money.out.create', 'money.out.view', 'money.view');
  const canPurchase = isOwner || can('goods.purchase.create', 'goods.purchase.view', 'goods.view');

  const [now, setNow] = useState(() => new Date().toISOString());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date().toISOString()), 1000 * 60);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <header className="home-welcome-bar">
      <div className="home-welcome-info">
        <h1 className="home-welcome-title">
          <span>مرحباً، {userName || 'مستخدم النظام'}</span>
        </h1>
        <p className="home-welcome-subtitle">
          {companyName}
        </p>
      </div>

      <nav className="home-actions-group" aria-label="الوصول السريع">
        {canSale && (
          <Link
            to="/invoices?tab=sale&action=new"
            className="btn primary compact"
            title="إنشاء فاتورة بيع جديدة فوراً"
          >
            <ShoppingCart size={16} />
            <span>فاتورة بيع جديدة</span>
          </Link>
        )}

        {canReceiptIn && (
          <Link
            to="/receipts?tab=in&action=new"
            className="btn secondary compact"
            title="تسجيل إيصال استلام فلوس"
          >
            <ArrowDownLeft size={15} className="text-success" />
            <span>استلام فلوس</span>
          </Link>
        )}

        {canReceiptOut && (
          <Link
            to="/receipts?tab=out&action=new"
            className="btn secondary compact"
            title="تسجيل إيصال صرف فلوس"
          >
            <ArrowUpRight size={15} className="text-danger" />
            <span>صرف فلوس</span>
          </Link>
        )}

        {canPurchase && (
          <Link
            to="/invoices?tab=purchase&action=new"
            className="btn secondary compact"
            title="إنشاء فاتورة شراء جديدة"
          >
            <ShoppingBag size={15} />
            <span>فاتورة شراء</span>
          </Link>
        )}
      </nav>
      <time className="home-welcome-clock" dateTime={now} aria-label="التاريخ والوقت بتوقيت القاهرة">
        <bdi dir="ltr" className="num tabular-nums">{creationTime(now)}</bdi>
        <bdi dir="ltr" className="num tabular-nums">{creationDate(now)}</bdi>
      </time>
    </header>
  );
}
