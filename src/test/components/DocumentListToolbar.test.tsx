import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DocumentListToolbar from '../../components/DocumentListToolbar';
import { exportDocumentExcel, type DocumentExportOptions } from '../../lib/documentExcel';
import { toast } from '../../components/Toast';
vi.mock('../../lib/documentExcel',()=>({exportDocumentExcel:vi.fn()}));
vi.mock('../../components/Toast',()=>({toast:{error:vi.fn()}}));
const options:DocumentExportOptions={scope:'receipt',kind:'in',filters:{notes:'بحث'},dateFrom:'2026-11-06',dateTo:'2026-11-06',
  showDeleted:false,sortOrder:'date-desc',canViewProfit:false,title:'إيصالات الاستلام'};
describe('document export action',()=>{
  beforeEach(()=>vi.clearAllMocks());
  it('prevents duplicate exports while the workbook is loading',async()=>{
    let finish!:()=>void;
    vi.mocked(exportDocumentExcel).mockReturnValue(new Promise<void>(resolve=>{finish=resolve;}));
    render(<DocumentListToolbar options={options} onDatesChange={vi.fn()} />);
    const button=screen.getByRole('button',{name:'تصدير الجدول إلى إكسيل'});
    fireEvent.click(button);fireEvent.click(button);
    await waitFor(()=>expect(exportDocumentExcel).toHaveBeenCalledTimes(1));
    expect(exportDocumentExcel).toHaveBeenCalledWith(options);
    expect(button).toBeDisabled();expect(button).toHaveAttribute('aria-busy','true');
    finish();
    await waitFor(()=>expect(button).not.toBeDisabled());
  });
  it('reports a failed export and lets the user retry',async()=>{
    vi.mocked(exportDocumentExcel).mockRejectedValue(new Error('لم يكتمل تحميل بيانات التصدير. حاول مرة أخرى.'));
    render(<DocumentListToolbar options={options} onDatesChange={vi.fn()} />);
    const button=screen.getByRole('button',{name:'تصدير الجدول إلى إكسيل'});
    fireEvent.click(button);
    await waitFor(()=>expect(toast.error).toHaveBeenCalledWith('لم يكتمل تحميل بيانات التصدير. حاول مرة أخرى.'));
    expect(button).not.toBeDisabled();
  });

  it('places the active filter reset button inside the end actions group beside export', () => {
    const onReset = vi.fn();
    const { container } = render(
      <DocumentListToolbar options={options} onDatesChange={vi.fn()} onResetFilters={onReset} />,
    );

    const actionsGroup = container.querySelector('.document-toolbar-actions');
    const filtersGroup = container.querySelector('.erp-filters');
    const resetBtn = screen.getByRole('button', { name: /مسح الفلاتر/ });
    const exportBtn = screen.getByRole('button', { name: 'تصدير الجدول إلى إكسيل' });

    expect(actionsGroup).toContainElement(resetBtn);
    expect(actionsGroup).toContainElement(exportBtn);
    expect(filtersGroup).not.toContainElement(resetBtn);
    expect(resetBtn).toHaveTextContent('1');

    fireEvent.click(resetBtn);
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('forwards disabled state to PeriodFilter controls and filter reset button', () => {
    render(
      <DocumentListToolbar
        options={options}
        onDatesChange={vi.fn()}
        onResetFilters={vi.fn()}
        disabled
      />,
    );

    expect(screen.getByRole('combobox', { name: 'الفترة' })).toBeDisabled();
    expect(screen.getByLabelText('من تاريخ')).toBeDisabled();
    expect(screen.getByLabelText('إلى تاريخ')).toBeDisabled();
    expect(screen.getByRole('button', { name: /مسح الفلاتر/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'تصدير الجدول إلى إكسيل' })).toBeDisabled();
  });
});
