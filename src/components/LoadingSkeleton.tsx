import type { CSSProperties } from 'react';

export function Skeleton({ width = '100%' }: { width?: string }) {
  return <span className="loading-skeleton" style={{ inlineSize: width }} aria-hidden="true" />;
}

export function LoadingMessage({ children }: { children: string }) {
  return <span className="loading-message" role="status">{children}</span>;
}

export function SkeletonRows({ columns }: { columns: number }) {
  return Array.from({ length: 4 }, (_, row) => (
    <tr key={row} className="skeleton-row" aria-hidden={row !== 0 || undefined}>
      {Array.from({ length: columns }, (_, column) => (
        <td key={column}>
          {row === 0 && column === 0 && <LoadingMessage>جارٍ التحميل…</LoadingMessage>}
          <Skeleton width={column % 2 === 0 ? '75%' : '55%'} />
        </td>
      ))}
    </tr>
  ));
}

export function LoadingSkeleton({
  layout = 'page',
  label,
}: {
  layout?: 'page' | 'dashboard' | 'form';
  label: string;
}) {
  const sections = layout === 'dashboard' ? [1, 3, 3, 2] : layout === 'form' ? [3, 4, 1] : [1, 1];

  return (
    <div className={`loading-layout loading-layout-${layout}`}>
      <LoadingMessage>{label}</LoadingMessage>
      {sections.map((columns, section) => (
        <div key={section} className="loading-layout-section" style={{ '--skeleton-columns': columns } as CSSProperties} aria-hidden="true">
          {Array.from({ length: columns }, (_, column) => (
            <div key={column} className="loading-layout-block">
              <Skeleton width={layout === 'page' && section === 0 ? '12rem' : '55%'} />
              <Skeleton width="80%" />
              {section > 0 && <Skeleton width="65%" />}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
