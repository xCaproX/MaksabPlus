import { Link } from 'react-router-dom';
import { ShoppingCart, ArrowDownLeft, ArrowUpRight, ShoppingBag } from 'lucide-react';
import { useAccess } from '../../lib/access';
import { formatTodayLongAr } from '../../lib/format';

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

  const todayStr = formatTodayLongAr();

  return (
    <div className="home-welcome-bar">
      <div className="home-welcome-info">
        <h1 className="home-welcome-title">
          <span>مرحباً، {userName || 'مستخدم النظام'}</span>
        </h1>
        <p className="home-welcome-subtitle">
          <span>{companyName}</span> • <span>{todayStr}</span>
        </p>
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
