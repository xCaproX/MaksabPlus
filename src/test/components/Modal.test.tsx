import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import Modal from '../../components/Modal';

describe('Modal - المكون المشترك للنوافذ المنبثقة', () => {
  it('يعرض العنوان والمحتوى الداخلي بنجاح', () => {
    render(
      <Modal title="نافذة تجريبية" onClose={vi.fn()}>
        <p>محتوى النموذج</p>
      </Modal>
    );

    expect(screen.getByText('نافذة تجريبية')).toBeInTheDocument();
    expect(screen.getByText('محتوى النموذج')).toBeInTheDocument();
  });

  describe('السلوك الافتراضي (بدون تفعيل حراسة التعديلات)', () => {
    it('يغلق المودال فوراً عند الضغط على مفتاح Escape', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة بدون تعديلات" onClose={handleClose}>
          <p>محتوى</p>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('يغلق المودال فوراً عند النقر على الخلفية', () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal title="نافذة بدون تعديلات" onClose={handleClose}>
          <p>محتوى</p>
        </Modal>
      );

      const backdrop = container.querySelector('.modal-backdrop');
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop!);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('يغلق المودال فوراً عند النقر على زر الإغلاق X في الترويسة', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة بدون تعديلات" onClose={handleClose}>
          <p>محتوى</p>
        </Modal>
      );

      const closeBtn = screen.getByRole('button', { name: 'إغلاق' });
      fireEvent.click(closeBtn);
      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('يغلق فوراً إذا كان isDirty=true لكن confirmOnDismiss غير مفعل (false)', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة بتعديلات غير محمية" onClose={handleClose} isDirty={true} confirmOnDismiss={false}>
          <p>محتوى</p>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(handleClose).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('تأكيد الإغلاق')).not.toBeInTheDocument();
    });
  });

  describe('حراسة التعديلات (isDirty=true && confirmOnDismiss=true)', () => {
    it('يعترض الإغلاق عند الضغط على Escape ويعرض نافذة التأكيد دون إغلاق المودال', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة محمية" onClose={handleClose} isDirty={true} confirmOnDismiss={true}>
          <p>نموذج به بيانات مدخلة</p>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      // لم يتم استدعاء onClose
      expect(handleClose).not.toHaveBeenCalled();
      // تم إظهار واجهة التأكيد
      expect(screen.getByText('تأكيد الإغلاق')).toBeInTheDocument();
      expect(
        screen.getByText('توجد تعديلات غير محفوظة، هل أنت متأكد من رغبتك في الإغلاق وتجاهل التعديلات؟')
      ).toBeInTheDocument();
    });

    it('يعترض الإغلاق عند النقر على الخلفية ويعرض نافذة التأكيد', () => {
      const handleClose = vi.fn();
      const { container } = render(
        <Modal title="نافذة محمية" onClose={handleClose} isDirty={true} confirmOnDismiss={true}>
          <p>محتوى</p>
        </Modal>
      );

      const backdrop = container.querySelector('.modal-backdrop');
      fireEvent.click(backdrop!);

      expect(handleClose).not.toHaveBeenCalled();
      expect(screen.getByText('تأكيد الإغلاق')).toBeInTheDocument();
    });

    it('يعترض الإغلاق عند النقر على زر X ويعرض نافذة التأكيد', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة محمية" onClose={handleClose} isDirty={true} confirmOnDismiss={true}>
          <p>محتوى</p>
        </Modal>
      );

      const closeBtn = screen.getByRole('button', { name: 'إغلاق' });
      fireEvent.click(closeBtn);

      expect(handleClose).not.toHaveBeenCalled();
      expect(screen.getByText('تأكيد الإغلاق')).toBeInTheDocument();
    });

    it('يغلق المودال ويستدعي onClose عند النقر على "إغلاق وتجاهل التعديلات"', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة محمية" onClose={handleClose} isDirty={true} confirmOnDismiss={true}>
          <p>محتوى</p>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      const discardBtn = screen.getByRole('button', { name: 'إغلاق وتجاهل التعديلات' });
      fireEvent.click(discardBtn);

      expect(handleClose).toHaveBeenCalledTimes(1);
    });

    it('يخفي رسالة التأكيد ويستمر في المودال دون استدعاء onClose عند النقر على "متابعة التعديل"', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة محمية" onClose={handleClose} isDirty={true} confirmOnDismiss={true}>
          <p>محتوى</p>
        </Modal>
      );

      fireEvent.keyDown(document, { key: 'Escape' });

      const resumeBtn = screen.getByRole('button', { name: 'متابعة التعديل' });
      fireEvent.click(resumeBtn);

      expect(handleClose).not.toHaveBeenCalled();
      expect(screen.queryByText('تأكيد الإغلاق')).not.toBeInTheDocument();
    });

    it('يغلق نافذة التأكيد فقط ويبقى داخل المودال عند الضغط على Escape أثناء عرض التأكيد', () => {
      const handleClose = vi.fn();
      render(
        <Modal title="نافذة محمية" onClose={handleClose} isDirty={true} confirmOnDismiss={true}>
          <p>محتوى</p>
        </Modal>
      );

      // أول ضغطة تفتح نافذة التأكيد
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getByText('تأكيد الإغلاق')).toBeInTheDocument();
      expect(handleClose).not.toHaveBeenCalled();

      // ثاني ضغطة تغلق نافذة التأكيد فقط
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByText('تأكيد الإغلاق')).not.toBeInTheDocument();
      expect(handleClose).not.toHaveBeenCalled();
      expect(screen.getByText('نافذة محمية')).toBeInTheDocument();
    });
  });
});
