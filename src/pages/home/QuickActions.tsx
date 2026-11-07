import { Link } from 'react-router-dom';
import { ShoppingCart, ArrowDownLeft, ArrowUpRight, ShoppingBag, Building2, CalendarDays } from 'lucide-react';
import { useAccess } from '../../lib/access';
import { formatDate, today } from '../../lib/format';

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

  const date = today();

  return (
    <div className="home-welcome-bar">
      <div className="home-welcome-info">
        <h1 className="home-welcome-title">
          <span>مرحباً، <bdi dir="auto" className="tabular-nums">{userName || 'مستخدم النظام'}</bdi></span>
        </h1>
        <div className="home-welcome-meta">
          {companyName && (
            <span className="home-welcome-meta-item home-welcome-company">
              <Building2 size={14} aria-hidden="true" />
              <bdi dir="auto">
                {companyName.split(/(\p{Nd}+(?:[./-]\p{Nd}+)+)/u).map((part, index) => (
                  index % 2 === 0 ? part : <bdi key={index} dir="ltr" className="tabular-nums">{part}</bdi>
                ))}
              </bdi>
            </span>
          )}
          <span className="home-welcome-meta-item">
            <CalendarDays size={14} aria-hidden="true" />
            <time dateTime={date} dir="ltr" className="tabular-nums">{formatDate(date)}</time>
          </span>
        </div>
      </div>

      <div className="home-actions-group">
        {canSale && (
          <Link
            to="/invoices?tab=sale&action=new"
            className="btn primary"
            title="إنشاء فاتورة بيع جديدة فوراً"
          >
            <ShoppingCart size={16} />
            <span>فاتورة بيع جديدة</span>
          </Link>
        )}

        {canReceiptIn && (
          <Link
            to="/receipts?tab=in&action=new"
            className="btn secondary"
            title="تسجيل إيصال استلام فلوس"
          >
            <ArrowDownLeft size={15} className="text-success" />
            <span>استلام فلوس</span>
          </Link>
        )}

        {canReceiptOut && (
          <Link
            to="/receipts?tab=out&action=new"
            className="btn secondary"
            title="تسجيل إيصال صرف فلوس"
          >
            <ArrowUpRight size={15} className="text-danger" />
            <span>صرف فلوس</span>
          </Link>
        )}

        {canPurchase && (
          <Link
            to="/invoices?tab=purchase&action=new"
            className="btn secondary"
            title="إنشاء فاتورة شراء جديدة"
          >
            <ShoppingBag size={15} />
            <span>فاتورة شراء</span>
          </Link>
        )}
      </div>
    </div>
  );
}
