import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function DashboardCardAction({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="dashboard-card-action" aria-label={label} title={label}>
      <ArrowLeft size={16} aria-hidden="true" />
    </Link>
  );
}
