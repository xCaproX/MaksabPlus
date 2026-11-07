import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Inbox, Plus } from 'lucide-react';
import EmptyState from '../../components/EmptyState';

describe('EmptyState - مكوّن الحالة الفارغة الموحد', () => {
  it('يعرض العنوان والوصف بنجاح', () => {
    render(
      <EmptyState
        title="لا توجد بيانات متاحة"
        description="جرّب تعديل خيارات البحث."
      />
    );

    expect(screen.getByText('لا توجد بيانات متاحة')).toBeInTheDocument();
    expect(screen.getByText('جرّب تعديل خيارات البحث.')).toBeInTheDocument();
  });

  it('يعرض الأيقونة الممررة', () => {
    const { container } = render(
      <EmptyState
        icon={Inbox}
        title="القائمة فارغة"
      />
    );

    expect(container.querySelector('.empty-state-icon')).toBeInTheDocument();
  });

  it('يعرض زر الإجراء وينفذ onClick عند الضغط عليه', () => {
    const handleClick = vi.fn();
    render(
      <EmptyState
        title="لا توجد عناصر"
        action={{
          label: 'إضافة عنصر جديد',
          onClick: handleClick,
          icon: Plus,
          variant: 'primary',
        }}
      />
    );

    const button = screen.getByRole('button', { name: /إضافة عنصر جديد/ });
    expect(button).toBeInTheDocument();
    expect(button).toHaveClass('primary');

    fireEvent.click(button);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('يدعم النمط المدمج compact للشاشات الضيقة واللوحات الجانبية', () => {
    const { container } = render(
      <EmptyState
        compact
        title="اختر حساباً"
      />
    );

    expect(container.querySelector('.empty-state')).toHaveClass('is-compact');
  });

  it('يغلف المكوّن داخل صف وخلية جدول عند تمرير colSpan', () => {
    const { container } = render(
      <table>
        <tbody>
          <EmptyState
            colSpan={8}
            title="لا توجد سجلات"
          />
        </tbody>
      </table>
    );

    const tr = container.querySelector('tr.empty-state-row');
    const td = container.querySelector('td.empty-state-cell');

    expect(tr).toBeInTheDocument();
    expect(td).toBeInTheDocument();
    expect(td).toHaveAttribute('colspan', '8');
    expect(screen.getByText('لا توجد سجلات')).toBeInTheDocument();
  });
});
