import { useCallback, useState } from 'react';

export function useDocumentPageNumber(criteria: readonly unknown[]) {
  const [pagination, setPagination] = useState({ criteria, page: 1 });
  const setPage = useCallback((page: number) => {
    setPagination((current) => current.page === page ? current : { ...current, page });
  }, []);

  if (criteria.length !== pagination.criteria.length ||
      criteria.some((value, index) => !Object.is(value, pagination.criteria[index]))) {
    // Reset before committing the render so effects never request the old
    // page with the newly applied criteria.
    setPagination({ criteria, page: 1 });
    return { page: 1, setPage };
  }

  return { page: pagination.page, setPage };
}
