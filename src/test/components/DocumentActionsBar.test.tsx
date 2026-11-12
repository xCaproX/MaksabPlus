import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import DocumentActionsBar from '../../components/DocumentActionsBar';

describe('DocumentActionsBar', () => {
  it('renders readOnly actions consistently and invokes callbacks', () => {
    const onRestore = vi.fn();
    const onEdit = vi.fn();
    const onPrint = vi.fn();
    const onDelete = vi.fn();
    const onCancel = vi.fn();

    render(
      <DocumentActionsBar
        isReadOnly
        isEditing
        busy={false}
        saveLabel="حفظ"
        restoreLabel="استعادة"
        editLabel="تعديل"
        printLabel="طباعة"
        deleteLabel="حذف"
        onRestore={onRestore}
        onEdit={onEdit}
        onPrint={onPrint}
        onDelete={onDelete}
        onCancel={onCancel}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'استعادة' }));
    fireEvent.click(screen.getByRole('button', { name: 'تعديل' }));
    fireEvent.click(screen.getByRole('button', { name: 'طباعة' }));
    fireEvent.click(screen.getByRole('button', { name: 'حذف' }));
    fireEvent.click(screen.getByRole('button', { name: 'إغلاق' }));

    expect(onRestore).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onPrint).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('disables save when saveDisabled is true in create mode', () => {
    const onResetNew = vi.fn();
    render(
      <DocumentActionsBar
        isReadOnly={false}
        isEditing={false}
        busy={false}
        saveDisabled
        saveLabel="حفظ المستند"
        restoreLabel="استعادة"
        editLabel="تعديل"
        onCancel={vi.fn()}
        onResetNew={onResetNew}
      />,
    );

    expect(screen.getByRole('button', { name: 'حفظ المستند' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'مسح / جديد' }));
    expect(onResetNew).toHaveBeenCalledTimes(1);
  });
});
