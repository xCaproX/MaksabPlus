import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentTable, { type DocumentTableColumn } from '../../components/DocumentTable';

interface TestDoc {
  id: string;
  number: string;
  title: string;
  amount: number;
}

describe('DocumentTable - مكوّن جدول المستندات الموحد', () => {
  const columns: DocumentTableColumn<TestDoc>[] = [
    {
      key: 'number',
      header: 'الرقم',
      sortField: 'number',
      headerClassName: 'col-number',
      render: (doc) => doc.number,
      cellClassName: 'col-number strong',
    },
    {
      key: 'title',
      header: 'العنوان',
      render: (doc) => doc.title,
    },
    {
      key: 'amount',
      header: 'المبلغ',
      sortField: 'amount',
      align: 'end',
      render: (doc) => `${doc.amount} ج.م`,
      cellClassName: 'num',
    },
  ];

  const rows: TestDoc[] = [
    { id: '1', number: 'DOC-001', title: 'مستند أول', amount: 100 },
    { id: '2', number: 'DOC-002', title: 'مستند ثان', amount: 200 },
  ];

  it('يعرض الأعمدة والصفوف بنجاح مع الفئات التنسيقية', () => {
    render(
      <DocumentTable
        columns={columns}
        rows={rows}
        loading={false}
        onView={vi.fn()}
        emptyTitle="لا توجد بيانات"
      />
    );

    expect(screen.getByText('DOC-001')).toBeInTheDocument();
    expect(screen.getByText('مستند أول')).toBeInTheDocument();
    expect(screen.getByText('100 ج.م')).toBeInTheDocument();
    expect(screen.getByText('DOC-002')).toBeInTheDocument();

    const headers = screen.getAllByRole('columnheader');
    expect(headers.map((h) => h.textContent)).toEqual(['الرقم', 'العنوان', 'المبلغ']);
  });

  it('يتعامل مع النقر على الصف ومفتاحي Enter و Space لفتح المستند', () => {
    const handleView = vi.fn();
    render(
      <DocumentTable
        columns={columns}
        rows={rows}
        loading={false}
        onView={handleView}
        emptyTitle="لا توجد بيانات"
      />
    );

    const firstRow = screen.getByText('DOC-001').closest('tr')!;
    fireEvent.click(firstRow);
    expect(handleView).toHaveBeenCalledWith(rows[0]);

    fireEvent.keyDown(firstRow, { key: 'Enter' });
    expect(handleView).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(firstRow, { key: ' ' });
    expect(handleView).toHaveBeenCalledTimes(3);
  });

  it('يعرض صف التحميل عند تفعيل loading', () => {
    render(
      <DocumentTable
        columns={columns}
        rows={[]}
        loading={true}
        onView={vi.fn()}
        emptyTitle="لا توجد بيانات"
      />
    );

    expect(screen.getByText('جارٍ التحميل…')).toBeInTheDocument();
    expect(screen.getByRole('status').closest('tr')?.cells).toHaveLength(3);
  });

  it('يعرض EmptyState عند عدم وجود صفوف وانتهاء التحميل', () => {
    render(
      <DocumentTable
        columns={columns}
        rows={[]}
        loading={false}
        onView={vi.fn()}
        emptyTitle="لا توجد فواتير مطابقة"
        emptyDescription="جرّب تعديل كلمات البحث."
      />
    );

    expect(screen.getByText('لا توجد فواتير مطابقة')).toBeInTheDocument();
    expect(screen.getByText('جرّب تعديل كلمات البحث.')).toBeInTheDocument();
  });

  it('يعرض رأس وخلية الإجراءات عند تمرير renderRowActions', () => {
    render(
      <DocumentTable
        columns={columns}
        rows={rows}
        loading={false}
        onView={vi.fn()}
        renderRowActions={(doc) => <button type="button">تعديل {doc.number}</button>}
        emptyTitle="لا توجد بيانات"
      />
    );

    const headers = screen.getAllByRole('columnheader');
    expect(headers).toHaveLength(4);
    expect(headers[3]).toHaveAttribute('aria-label', 'الإجراءات');
    expect(screen.getByRole('button', { name: 'تعديل DOC-001' })).toBeInTheDocument();
  });
});
