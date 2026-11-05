import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Modal from '../../components/Modal';

describe('shared modal dismissal', () => {
  it('retains close button, backdrop and Escape dismissal by default', () => {
    const close = vi.fn();
    render(<Modal title="اختبار" onClose={close}><input aria-label="حقل" /></Modal>);
    fireEvent.click(screen.getByLabelText('حقل'));
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    fireEvent.click(screen.getByRole('presentation'));
    expect(close).toHaveBeenCalledTimes(3);
  });
  it('blocks every dismissal path while saving', () => {
    const close = vi.fn();
    render(<Modal title="اختبار" onClose={close} dismissible={false}>جارٍ الحفظ</Modal>);
    expect(screen.getByRole('button', { name: 'إغلاق' })).toBeDisabled();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('presentation'));
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));
    expect(close).not.toHaveBeenCalled();
  });
});
