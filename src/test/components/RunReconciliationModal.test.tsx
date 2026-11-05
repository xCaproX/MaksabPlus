import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import RunReconciliationModal from '../../pages/management/RunReconciliationModal';

describe('RunReconciliationModal Component', () => {
  it('يعرض خياري الفحص وحقل الملاحظات بشكل سليم', () => {
    render(
      <RunReconciliationModal
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        loading={false}
      />
    );

    expect(screen.getByText('بدء فحص ومطابقة الأرصدة والمخزون')).toBeInTheDocument();
    expect(screen.getByText('فحص وتصحيح فوري')).toBeInTheDocument();
    expect(screen.getByText('فحص استكشافي (محاكاة)')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/مثال: جرد نهاية الشهر/)).toBeInTheDocument();
  });

  it('يستدعي onConfirm بالنمط المختار والملاحظات المكتوبة', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    render(
      <RunReconciliationModal
        onClose={vi.fn()}
        onConfirm={handleConfirm}
        loading={false}
      />
    );

    // اختيار فحص استكشافي
    const simRadio = screen.getByLabelText(/فحص استكشافي/);
    fireEvent.click(simRadio);

    // إدخال ملاحظات
    const notesInput = screen.getByPlaceholderText(/مثال: جرد نهاية الشهر/);
    fireEvent.change(notesInput, { target: { value: 'جرد تجريبي' } });

    // الضغط على بدء الفحص
    const submitBtn = screen.getByText('بدء الفحص الآن');
    fireEvent.click(submitBtn);

    expect(handleConfirm).toHaveBeenCalledWith('simulation', 'جرد تجريبي');
  });

  it('يستدعي onClose عند الضغط على زر الإلغاء', () => {
    const handleClose = vi.fn();
    render(
      <RunReconciliationModal
        onClose={handleClose}
        onConfirm={vi.fn()}
        loading={false}
      />
    );

    const cancelBtn = screen.getByText('إلغاء');
    fireEvent.click(cancelBtn);

    expect(handleClose).toHaveBeenCalled();
  });
});
