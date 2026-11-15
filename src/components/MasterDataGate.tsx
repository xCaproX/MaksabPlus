import type { ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import EmptyState from './EmptyState';
import { LoadingSkeleton } from './LoadingSkeleton';
import type { MasterDataContextType, MasterDataResource } from '../context/MasterDataContext';

interface Props {
  resources: readonly MasterDataResource[];
  status: MasterDataContextType['resourceStatus'];
  children: ReactNode;
  onRetry?: () => void;
}

export default function MasterDataGate({ resources, status, children, onRetry }: Props) {
  if (resources.some((key) => status[key].error)) {
    return (
      <EmptyState
        compact
        role="alert"
        icon={AlertCircle}
        title="تعذّر تحميل بيانات النموذج."
        description={!onRetry ? 'اقفله وافتحه تاني للمحاولة.' : undefined}
        action={onRetry ? { label: 'إعادة المحاولة', onClick: onRetry, icon: RefreshCw } : undefined}
      />
    );
  }

  const ready = resources.every((key) => status[key].hasLoaded && !status[key].loading);
  if (!ready) {
    return <LoadingSkeleton layout="form" label="جارٍ تحميل بيانات النموذج…" />;
  }

  return children;
}
