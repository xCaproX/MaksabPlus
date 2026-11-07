import { LoadingSkeleton } from './LoadingSkeleton';
import type { ReactNode } from 'react';
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
      <div className="empty-state">
        <p role="alert">تعذّر تحميل بيانات النموذج.{!onRetry && " اقفله وافتحه تاني للمحاولة."}</p>
        {onRetry && <button type="button" className="btn outline" onClick={onRetry}>إعادة المحاولة</button>}
      </div>
    );
  }

  const ready = resources.every((key) => status[key].hasLoaded && !status[key].loading);
  if (!ready) {
    return <LoadingSkeleton layout="form" label="جارٍ تحميل بيانات النموذج…" />;
  }

  return children;
}
