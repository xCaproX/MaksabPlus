import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RowActions from '../../components/RowActions';

describe('shared action menu', () => {
  it('preserves row edit, restore, custom and delete actions and closes after selection', () => {
    const actions = [vi.fn(), vi.fn(), vi.fn(), vi.fn()];
    render(<RowActions onEdit={actions[0]} onRestore={actions[1]} onDelete={actions[3]}
      customActions={[{ label: 'إجراء إضافي', onClick: actions[2] }]} />);
    const trigger = screen.getByRole('button', { name: 'قائمة الإجراءات' });
    for (const [index, name] of ['تعديل', 'استعادة', 'إجراء إضافي', 'حذف'].entries()) {
      fireEvent.click(trigger);
      fireEvent.click(screen.getByRole('menuitem', { name }));
      expect(actions[index]).toHaveBeenCalledOnce();
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    }
  });

  it('supports a named custom trigger and an upward menu without showing actions initially', () => {
    render(<RowActions portal={false} trigger={<span>حسابي</span>} triggerLabel="خيارات حسابي" placement="top"
      customActions={[{ label: 'خروج', onClick: vi.fn() }]} />);
    const trigger = screen.getByRole('button', { name: 'خيارات حسابي' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('menuitem')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu', { name: 'خيارات حسابي' });
    expect(menu).toHaveAttribute('data-placement', 'top');
    expect(trigger).toHaveAttribute('aria-controls', menu.id);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('renders row options outside the scroll container and keeps the trigger usable', () => {
    render(<div data-testid="table-scroll"><RowActions onRestore={vi.fn()} /></div>);
    const trigger = screen.getByRole('button', { name: 'قائمة الإجراءات' });
    fireEvent.click(trigger);
    const menu = screen.getByRole('menu');
    expect(screen.getByTestId('table-scroll')).not.toContainElement(menu);
    expect(menu.parentElement).toBe(document.body);
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens and navigates with arrows, Home and End, and Escape restores the trigger focus', () => {
    render(<RowActions onEdit={vi.fn()} onDelete={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'قائمة الإجراءات' });
    fireEvent.keyDown(trigger, { key: 'ArrowUp' });
    const edit = screen.getByRole('menuitem', { name: 'تعديل' });
    const remove = screen.getByRole('menuitem', { name: 'حذف' });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(remove, { key: 'ArrowDown' });
    expect(edit).toHaveFocus();
    fireEvent.keyDown(edit, { key: 'ArrowUp' });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(remove, { key: 'Home' });
    expect(edit).toHaveFocus();
    fireEvent.keyDown(edit, { key: 'End' });
    expect(remove).toHaveFocus();
    fireEvent.keyDown(remove, { key: 'Escape' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.keyDown(trigger, { key: 'ArrowDown' });
    expect(screen.getByRole('menuitem', { name: 'تعديل' })).toHaveFocus();
  });

  it('closes on an outside pointer or when focus leaves without executing an action', () => {
    const action = vi.fn();
    render(<><RowActions onEdit={action} /><button>خارج القائمة</button></>);
    const trigger = screen.getByRole('button', { name: 'قائمة الإجراءات' });
    fireEvent.click(trigger);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    fireEvent.click(trigger);
    fireEvent.blur(screen.getByRole('menuitem'), { relatedTarget: screen.getByText('خارج القائمة') });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it('does not render an empty menu trigger', () => {
    render(<RowActions />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
