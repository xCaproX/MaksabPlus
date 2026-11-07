import { Skeleton } from './LoadingSkeleton';
export interface PaginationProps {
  page: number;
  pageCount: number;
  totalCount?: number;
  pageSize?: number;
  onPageChange: (nextPage: number) => void;
  loading?: boolean;
  countsPending?: boolean;
}

export default function Pagination({
  page,
  pageCount,
  totalCount,
  pageSize = 20,
  onPageChange,
  loading = false,
  countsPending = false,
}: PaginationProps) {
  const safePageCount = Math.max(1, pageCount);
  const startItem = totalCount ? (page - 1) * pageSize + 1 : 0;
  const endItem = totalCount ? Math.min(page * pageSize, totalCount) : 0;

  return (
    <div className="erp-pagination" aria-label="شريط ترقيم الصفحات">
      <span>
        {countsPending ? <Skeleton width="7rem" /> : totalCount !== undefined ? (
          <>
            عرض <bdi>{startItem}</bdi>–<bdi>{endItem}</bdi> من <bdi>{totalCount}</bdi>
          </>
        ) : (
          <span>الصفحة الحالية</span>
        )}
      </span>
      <div>
        <button
          type="button"
          className="btn compact"
          disabled={page <= 1 || loading}
          onClick={() => onPageChange(page - 1)}
          aria-label="الصفحة السابقة"
        >
          السابق
        </button>
        <span className="tabular-nums" dir="ltr">
          {countsPending ? <Skeleton width="2rem" /> : <><bdi>{page}</bdi> / <bdi>{safePageCount}</bdi></>}
        </span>
        <button
          type="button"
          className="btn compact"
          disabled={page >= safePageCount || loading}
          onClick={() => onPageChange(page + 1)}
          aria-label="الصفحة التالية"
        >
          التالي
        </button>
      </div>
    </div>
  );
}
