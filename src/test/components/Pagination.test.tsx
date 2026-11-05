import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Pagination from '../../components/Pagination';

describe('Pagination Component', () => {
  it('يعرض معلومات الترقيم ونطاق العناصر المكتوب بشكل سليم', () => {
    render(
      <Pagination
        page={2}
        pageCount={5}
        totalCount={95}
        pageSize={20}
        onPageChange={() => {}}
      />
    );

    // نطاق العناصر: 21 إلى 40 من 95
    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('95')).toBeInTheDocument();

    // أرقام الصفحة
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('يعطل زر السابق عند التواجد في الصفحة الأولى', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        page={1}
        pageCount={3}
        totalCount={50}
        onPageChange={handlePageChange}
      />
    );

    const prevBtn = screen.getByLabelText('الصفحة السابقة');
    const nextBtn = screen.getByLabelText('الصفحة التالية');

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();

    fireEvent.click(nextBtn);
    expect(handlePageChange).toHaveBeenCalledWith(2);
  });

  it('يعطل زر التالي عند التواجد في الصفحة الأخيرة', () => {
    const handlePageChange = vi.fn();
    render(
      <Pagination
        page={4}
        pageCount={4}
        totalCount={80}
        onPageChange={handlePageChange}
      />
    );

    const prevBtn = screen.getByLabelText('الصفحة السابقة');
    const nextBtn = screen.getByLabelText('الصفحة التالية');

    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeDisabled();

    fireEvent.click(prevBtn);
    expect(handlePageChange).toHaveBeenCalledWith(3);
  });

  it('يعطل كلا الزرين أثناء حالة التحميل (loading)', () => {
    render(
      <Pagination
        page={2}
        pageCount={4}
        totalCount={80}
        loading={true}
        onPageChange={() => {}}
      />
    );

    expect(screen.getByLabelText('الصفحة السابقة')).toBeDisabled();
    expect(screen.getByLabelText('الصفحة التالية')).toBeDisabled();
  });
});
