import { useState, type ReactNode } from 'react';
import type { MasterDataContextType, MasterDataResource } from '../context/MasterDataContext';

interface Props {
  resources: readonly MasterDataResource[];
  status: MasterDataContextType['resourceStatus'];
  children: ReactNode;
}

export default function MasterDataGate({ resources, status, children }: Props) {
  const [ready, setReady] = useState(false);
  if (ready) return children;

  if (resources.every((key) => status[key].hasLoaded && !status[key].loading && !status[key].error)) {
    setReady(true);
    return children;
  }

  if (resources.some((key) => status[key].error)) {
    return <p className="empty-state" role="alert">تعذّر تحميل بيانات النموذج. اقفله وافتحه تاني للمحاولة.</p>;
  }

  return <p className="loading-state" role="status">جارٍ تحميل بيانات النموذج…</p>;
}
