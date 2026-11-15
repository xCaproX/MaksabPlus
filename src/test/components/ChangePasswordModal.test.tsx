import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ChangePasswordModal from '../../components/ChangePasswordModal';
import { toast } from '../../components/Toast';

vi.mock('../../components/Toast', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}));

vi.mock('../../lib/supabase', () => ({
  supabase: {
    auth: {
      updateUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    functions: {
      invoke: vi.fn().mockResolvedValue({ data: { ok: true }, error: null }),
    },
  },
}));

describe('ChangePasswordModal - نموذج تغيير كلمة المرور', () => {
  it('لا يعرض شيئاً عندما تكون isOpen=false', () => {
    const { container } = render(
      <ChangePasswordModal isOpen={false} onClose={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('يعرض عنوان الحساب الشخصي عند عدم تمرير targetUser', () => {
    render(<ChangePasswordModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByText('تغيير كلمة المرور')).toBeInTheDocument();
    expect(
      screen.getByText('أدخل كلمة المرور الجديدة لتسجيل الدخول إلى حسابك في مكسب بلس.')
    ).toBeInTheDocument();
  });

  it('يعرض عنوان وبيانات الموظف عند تمرير targetUser', () => {
    render(
      <ChangePasswordModal
        isOpen={true}
        onClose={vi.fn()}
        targetUser={{ id: 'user-1', name: 'أحمد الكاشير', email: 'ahmed@maksab.com' }}
      />
    );
    expect(screen.getByText('تغيير كلمة مرور «أحمد الكاشير»')).toBeInTheDocument();
    expect(
      screen.getByText(/أدخل كلمة المرور الجديدة للموظف \(ahmed@maksab.com\)/)
    ).toBeInTheDocument();
  });

  it('يرفض كلمة المرور إذا كانت أقل من 8 أحرف', () => {
    render(<ChangePasswordModal isOpen={true} onClose={vi.fn()} />);
    const inputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(inputs[0], { target: { value: '123' } });
    fireEvent.change(inputs[1], { target: { value: '123' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ كلمة المرور/ }));

    expect(toast.error).toHaveBeenCalledWith('كلمة المرور يجب أن تكون 8 أحرف على الأقل.');
  });

  it('يرفض إذا كانت كلمتا المرور غير متطابقتين', () => {
    render(<ChangePasswordModal isOpen={true} onClose={vi.fn()} />);
    const inputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(inputs[0], { target: { value: 'password123' } });
    fireEvent.change(inputs[1], { target: { value: 'different123' } });
    fireEvent.click(screen.getByRole('button', { name: /حفظ كلمة المرور/ }));

    expect(toast.error).toHaveBeenCalledWith('كلمتا المرور غير متطابقتين.');
  });

  it('يحرس زر الإلغاء عند تعديل كلمة المرور ويعيد إخفاءها عند الإغلاق', () => {
    const onClose = vi.fn();
    const { rerender } = render(<ChangePasswordModal isOpen={true} onClose={onClose} />);

    fireEvent.click(screen.getAllByRole('button', { name: /إظهار كلمة المرور/ })[0]);
    const inputs = screen.getAllByPlaceholderText('••••••••');
    expect(inputs[0]).toHaveAttribute('type', 'text');
    fireEvent.change(inputs[0], { target: { value: 'SecretPass123' } });

    fireEvent.click(screen.getByRole('button', { name: 'إلغاء' }));
    expect(onClose).not.toHaveBeenCalled();
    const confirmModal = screen.getByRole('dialog', { name: 'تجاهل التغييرات؟' });
    fireEvent.click(within(confirmModal).getByRole('button', { name: 'تجاهل وإغلاق' }));
    expect(onClose).toHaveBeenCalledOnce();

    rerender(<ChangePasswordModal isOpen={false} onClose={onClose} />);
    rerender(<ChangePasswordModal isOpen={true} onClose={onClose} />);
    expect(screen.getAllByPlaceholderText('••••••••')[0]).toHaveAttribute('type', 'password');
  });
});
