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
});
