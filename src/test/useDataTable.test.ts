import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataTable } from '../hooks/useDataTable';

describe('useDataTable hook', () => {
  const mockData = Array.from({ length: 45 }, (_, i) => ({
    id: i + 1,
    name: `عنصر ${i + 1}`,
    value: (i + 1) * 10,
  }));

  it('initializes with default pagination values', () => {
    const { result } = renderHook(() =>
      useDataTable({
        data: mockData,
        pageSize: 10,
      }),
    );

    expect(result.current.page).toBe(1);
    expect(result.current.totalCount).toBe(45);
    expect(result.current.pageCount).toBe(5);
    expect(result.current.pagedItems.length).toBe(10);
    expect(result.current.pagedItems[0].id).toBe(1);
    expect(result.current.hasPrevPage).toBe(false);
    expect(result.current.hasNextPage).toBe(true);
  });

  it('paginates correctly to next and previous pages', () => {
    const { result } = renderHook(() =>
      useDataTable({
        data: mockData,
        pageSize: 10,
      }),
    );

    act(() => {
      result.current.nextPage();
    });

    expect(result.current.page).toBe(2);
    expect(result.current.pagedItems[0].id).toBe(11);
    expect(result.current.hasPrevPage).toBe(true);

    act(() => {
      result.current.prevPage();
    });

    expect(result.current.page).toBe(1);
    expect(result.current.pagedItems[0].id).toBe(1);
  });

  it('filters data based on filterFn and resets page to 1', () => {
    const { result } = renderHook(() =>
      useDataTable({
        data: mockData,
        pageSize: 10,
        filterFn: (item, term) => (!term ? true : item.name.includes(term)),
      }),
    );

    // Go to page 2 first
    act(() => {
      result.current.setPage(2);
    });
    expect(result.current.page).toBe(2);

    // Apply search
    act(() => {
      result.current.setSearchTerm('عنصر 1');
    });

    // Should reset page to 1
    expect(result.current.page).toBe(1);
    expect(result.current.filteredItems.length).toBeGreaterThan(0);
    expect(result.current.filteredItems.every((item) => item.name.includes('عنصر 1'))).toBe(true);
  });

  it('sorts data based on sortFn', () => {
    type TestSort = 'val-asc' | 'val-desc';
    const { result } = renderHook(() =>
      useDataTable<{ id: number; name: string; value: number }, TestSort>({
        data: mockData,
        pageSize: 10,
        initialSort: 'val-asc',
        sortFn: (a, b, order) => {
          if (order === 'val-desc') return b.value - a.value;
          return a.value - b.value;
        },
      }),
    );

    expect(result.current.pagedItems[0].value).toBe(10);

    act(() => {
      result.current.setSortOrder('val-desc');
    });

    expect(result.current.pagedItems[0].value).toBe(450);
  });

  it('prevents page from overflowing when data shrinks', () => {
    let currentData = mockData;
    const { result, rerender } = renderHook(() =>
      useDataTable({
        data: currentData,
        pageSize: 10,
      }),
    );

    act(() => {
      result.current.setPage(5);
    });
    expect(result.current.page).toBe(5);

    // Shrink data so only 1 page exists
    currentData = mockData.slice(0, 5);
    rerender();

    expect(result.current.page).toBe(1);
  });
});
