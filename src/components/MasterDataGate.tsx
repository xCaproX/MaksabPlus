import type { ReactNode } from 'react';
import type { MasterDataContextType, MasterDataResource } from '../context/MasterDataContext';

interface Props {
  resources: readonly MasterDataResource[];
  status: MasterDataContextType['resourceStatus'];
  children: ReactNode;
}

export default function MasterDataGate({ resources, status, children }: Props) {
  if (resources.some((key) => status[key].error)) {
    return <p className="empty-state" role="alert">تعذّر تحميل بيانات النموذج. اقفله وافتحه تاني للمحاولة.</p>;
  }

  const ready = resources.every((key) => status[key].hasLoaded && !status[key].loading);
  if (!ready) {
    return <p className="loading-state" role="status">جارٍ تحميل بيانات النموذج…</p>;
  }

  return children;
}
