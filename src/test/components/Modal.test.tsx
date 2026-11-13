import { useState } from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import ConfirmDialog from '../../components/ConfirmDialog';
import InvoiceForm from '../../components/InvoiceForm';
import Modal, { useModalDirtyGuard } from '../../components/Modal';
import ReceiptForm from '../../components/ReceiptForm';

vi.mock('../../components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  },
}));

describe('shared modal dismissal & T-03a dirty/portal stack', () => {
  it('retains close button, backdrop and Escape dismissal by default and portals to document.body', () => {
    const close = vi.fn();
    const { container } = render(
      <Modal title="اختبار" onClose={close}>
        <input aria-label="حقل" />
      </Modal>,
    );
    expect(container.querySelector('.modal-backdrop')).toBeNull();
    expect(document.body.querySelector('.modal-backdrop')).not.toBeNull();

    fireEvent.click(screen.getByLabelText('حقل'));
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    fireEvent.click(screen.getByRole('presentation'));
    expect(close).toHaveBeenCalledTimes(3);
  });

  it('blocks every dismissal path while saving', () => {
    const close = vi.fn();
    render(
      <Modal title="اختبار" onClose={close} dismissible={false}>
        جارٍ الحفظ
      </Modal>,
    );
    expect(screen.getByRole('button', { name: 'إغلاق' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('presentation'));
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('intercepts Escape/backdrop/X on dirty modal, isolates top Escape to discard ConfirmDialog, and closes only after confirm', () => {
    const close = vi.fn();
    render(
      <Modal title="فاتورة" onClose={close} isDirty={true}>
        <input aria-label="ملاحظة" />
      </Modal>,
    );

    // Escape triggers discard ConfirmDialog without closing parent
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'تجاهل التغييرات؟' })).toBeInTheDocument();

    // Second Escape dismisses ONLY the top ConfirmDialog via modalStack
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'تجاهل التغييرات؟' })).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();

    // Click X -> discard prompt -> confirm
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    const confirmModal = screen.getByRole('dialog', { name: 'تجاهل التغييرات؟' });
    fireEvent.click(within(confirmModal).getByRole('button', { name: 'تجاهل وإغلاق' }));
    expect(close).toHaveBeenCalledOnce();
  });

  it('renders nested ConfirmDialog as document.body sibling and Escape closes only the top dialog', () => {
    const closeParent = vi.fn();
    function ParentWithNestedConfirm() {
      const [nestedOpen, setNestedOpen] = useState(true);
      return (
        <Modal title="النافذة الأساسية" onClose={closeParent}>
          <button type="button" onClick={() => setNestedOpen(true)}>
            فتح تأكيد
          </button>
          {nestedOpen && (
            <ConfirmDialog
              title="تأكيد السعر صفر"
              message="تأكيد؟"
              confirmLabel="نعم"
              onConfirm={() => setNestedOpen(false)}
              onCancel={() => setNestedOpen(false)}
            />
          )}
        </Modal>
      );
    }

    render(<ParentWithNestedConfirm />);
    const backdrops = document.body.querySelectorAll(':scope > .modal-backdrop');
    expect(backdrops).toHaveLength(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'تأكيد السعر صفر' })).not.toBeInTheDocument();
    expect(closeParent).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'النافذة الأساسية' })).toBeInTheDocument();
  });

  it('supports child form guard via useModalDirtyGuard and avoids false positives on InvoiceForm & ReceiptForm auto-defaults', () => {
    const closeInvoice = vi.fn();
    const accounts = [
      { id: 'acc-cash', name: 'عميل نقدي', kind: 'customer', balance: 0, is_active: true, system_key: 'cash_customer' },
      { id: 'acc-2', name: 'شركة النور', kind: 'customer', balance: 0, is_active: true, system_key: null },
    ] as any;
    const warehouses = [{ id: 'wh-1', name: 'المخزن الرئيسي', is_primary: true, is_active: true }] as any;
    const cashBoxes = [{ id: 'cb-1', name: 'الخزينة الرئيسية', is_primary: true, is_active: true, balance: 1000 }] as any;

    const { unmount } = render(
      <Modal title="فاتورة جديدة" onClose={closeInvoice}>
        <InvoiceForm
          kind="sale"
          accounts={accounts}
          warehouses={warehouses}
          cashBoxes={cashBoxes}
          items={[]}
          stockRows={[]}
          editing={null}
          onSaved={vi.fn()}
          onCancel={closeInvoice}
        />
      </Modal>,
    );

    // Untouched new InvoiceForm with cash_customer default closes immediately on Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeInvoice).toHaveBeenCalledOnce();
    unmount();

    const closeReceipt = vi.fn();
    const { unmount: unmountReceipt } = render(
      <MemoryRouter>
        <Modal title="إيصال استلام" onClose={closeReceipt}>
          <ReceiptForm
            direction="in"
            accounts={accounts}
            cashBoxes={cashBoxes}
            editing={null}
            onSaved={vi.fn()}
            onCancel={closeReceipt}
          />
        </Modal>
      </MemoryRouter>,
    );

    // Untouched new ReceiptForm with default primary cashbox closes immediately on Escape
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(closeReceipt).toHaveBeenCalledOnce();
    unmountReceipt();

    // Child form marking dirty intercepts internal Cancel too
    const cancelChild = vi.fn();
    function ChildGuardedForm() {
      const { requestClose } = useModalDirtyGuard(true, 'تغييرات غير محفوظة');
      return (
        <button type="button" onClick={() => requestClose(cancelChild)}>
          إلغاء النموذج
        </button>
      );
    }
    render(
      <Modal title="نموذج معدل" onClose={cancelChild}>
        <ChildGuardedForm />
      </Modal>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'إلغاء النموذج' }));
    expect(cancelChild).not.toHaveBeenCalled();
    expect(screen.getByText('تغييرات غير محفوظة')).toBeInTheDocument();
  });

  it('T-03b: wires aria-labelledby, traps Tab/Shift+Tab inside top dialog, and restores focus to connected trigger', () => {
    function TriggerHarness() {
      const [open, setOpen] = useState(false);
      return (
        <div>
          <button type="button" onClick={() => setOpen(true)}>
            فتح النافذة
          </button>
          {open && (
            <Modal title="عنوان الوصول" onClose={() => setOpen(false)}>
              <input aria-label="الحقل الأول" />
              <button type="button">زر أخير</button>
            </Modal>
          )}
        </div>
      );
    }

    render(<TriggerHarness />);
    const triggerBtn = screen.getByRole('button', { name: 'فتح النافذة' });
    triggerBtn.focus();
    fireEvent.click(triggerBtn);

    const dialog = screen.getByRole('dialog');
    const heading = screen.getByRole('heading', { level: 2, name: 'عنوان الوصول' });
    expect(dialog.getAttribute('aria-labelledby')).toBe(heading.id);

    const closeBtn = screen.getByRole('button', { name: 'إغلاق' });
    const lastBtn = screen.getByRole('button', { name: 'زر أخير' });

    lastBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeBtn);

    closeBtn.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(lastBtn);

    fireEvent.click(closeBtn);
    expect(document.activeElement).toBe(triggerBtn);
  });
});
