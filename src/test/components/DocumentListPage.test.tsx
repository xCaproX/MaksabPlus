import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import DocumentListPage from '../../components/DocumentListPage';

describe('DocumentListPage - الهيكل الموحد لصفحات المستندات', () => {
  const tabs = [
    { value: 'tab1', label: 'التبويب الأول' },
    { value: 'tab2', label: 'التبويب الثاني' },
  ];

  const defaultProps = {
    title: 'فواتير المبيعات',
    tabs,
    activeTab: 'tab1',
    onTabChange: vi.fn(),
    kpiItems: [{ id: 'kpi1', label: 'الإجمالي', value: '1,000 ج.م' }],
    toolbarScope: 'invoice' as const,
    toolbarFilters: {},
    dateFrom: '2026-01-01',
    dateTo: '2026-01-31',
    onDatesChange: vi.fn(),
    showDeleted: false,
    onDeletedToggle: vi.fn(),
    sortOrder: 'date-desc',
    newLabel: '+ فاتورة جديدة',
    onNew: vi.fn(),
    page: 1,
    totalCount: 50,
    onPageChange: vi.fn(),
    modalOpen: false,
    modalOnClose: vi.fn(),
    confirmation: null,
  };

  it('يعرض العنوان والتبويبات المتاحة', () => {
    const handleTabChange = vi.fn();
    render(
      <DocumentListPage {...defaultProps} onTabChange={handleTabChange}>
        <div data-testid="table-content">محتوى الجدول التجريبي</div>
      </DocumentListPage>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('فواتير المبيعات');

    expect(screen.getByText('التبويب الأول')).toHaveClass('active');
    expect(screen.getByText('التبويب الثاني')).not.toHaveClass('active');
    expect(screen.getByTestId('table-content')).toBeInTheDocument();

    fireEvent.click(screen.getByText('التبويب الثاني'));
    expect(handleTabChange).toHaveBeenCalledWith('tab2');
  });

  it('يعرض شارة تحذير المحذوفات عند تفعيل showDeleted', () => {
    render(
      <DocumentListPage
        {...defaultProps}
        showDeleted={true}
        deletedWarning="تنبيه: الفواتير المحذوفة لا تؤثر على الأرصدة."
      >
        <div>جدول المحذوفات</div>
      </DocumentListPage>
    );

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('المحذوفات — فواتير المبيعات');
    expect(screen.getByText('تنبيه: الفواتير المحذوفة لا تؤثر على الأرصدة.')).toBeInTheDocument();
  });

  it('يفتح المودال ويعرض المحتوى الممرر', () => {
    render(
      <DocumentListPage
        {...defaultProps}
        modalOpen={true}
        modalTitle="إضافة فاتورة جديدة"
        renderModalContent={() => <div>نموذج الفاتورة الداخلي</div>}
      >
        <div>الجدول</div>
      </DocumentListPage>
    );

    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('نموذج الفاتورة الداخلي')).toBeInTheDocument();
  });

  it('يعرض نافذة التأكيد عند وجود confirmation', () => {
    render(
      <DocumentListPage
        {...defaultProps}
        confirmation={{
          title: 'تأكيد الحذف',
          message: 'هل أنت متأكد من الحذف؟',
          confirmLabel: 'حذف',
          danger: true,
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }}
      >
        <div>الجدول</div>
      </DocumentListPage>
    );

    expect(screen.getByText('تأكيد الحذف')).toBeInTheDocument();
    expect(screen.getByText('هل أنت متأكد من الحذف؟')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف' })).toHaveClass('danger');
  });
});
