import { useState, useMemo, useEffect, type Dispatch, type SetStateAction } from 'react';

export interface UseDataTableOptions<T, S extends string = string> {
  data: T[];
  pageSize?: number;
  initialSort?: S;
  filterFn?: (item: T, searchTerm: string) => boolean;
  sortFn?: (a: T, b: T, sortOrder: S) => number;
  resetPageDeps?: unknown[];
}

export interface UseDataTableReturn<T, S extends string = string> {
  searchTerm: string;
  setSearchTerm: Dispatch<SetStateAction<string>>;
  sortOrder: S;
  setSortOrder: Dispatch<SetStateAction<S>>;
  page: number;
  setPage: Dispatch<SetStateAction<number>>;
  pageCount: number;
  totalCount: number;
  filteredItems: T[];
  pagedItems: T[];
  prevPage: () => void;
  nextPage: () => void;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

export const DEFAULT_PAGE_SIZE = 20;

export function useDataTable<T, S extends string = string>({
  data,
  pageSize = DEFAULT_PAGE_SIZE,
  initialSort = '' as S,
  filterFn,
  sortFn,
  resetPageDeps = [],
}: UseDataTableOptions<T, S>): UseDataTableReturn<T, S> {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortOrder, setSortOrder] = useState<S>(initialSort);
  const [page, setPage] = useState(1);

  // تصفية وترتيب البيانات
  const filteredItems = useMemo(() => {
    let list = data;

    if (filterFn) {
      list = list.filter((item) => filterFn(item, searchTerm));
    }

    if (sortFn && sortOrder) {
      list = [...list].sort((a, b) => sortFn(a, b, sortOrder));
    }

    return list;
  }, [data, filterFn, searchTerm, sortFn, sortOrder]);

  const totalCount = filteredItems.length;
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  // تصفير الصفحة عند البحث أو الفلترة أو تغيير التبويب
  useEffect(() => {
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, sortOrder, ...resetPageDeps]);

  // حماية رقم الصفحة من تجاوز الحد الأقصى
  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  // استخراج عناصر الصفحة الحالية
  const pagedItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredItems.slice(start, start + pageSize);
  }, [filteredItems, page, pageSize]);

  const prevPage = () => setPage((p) => Math.max(1, p - 1));
  const nextPage = () => setPage((p) => Math.min(pageCount, p + 1));

  return {
    searchTerm,
    setSearchTerm,
    sortOrder,
    setSortOrder,
    page,
    setPage,
    pageCount,
    totalCount,
    filteredItems,
    pagedItems,
    prevPage,
    nextPage,
    hasPrevPage: page > 1,
    hasNextPage: page < pageCount,
  };
}
