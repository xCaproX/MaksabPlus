import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccountBalanceCard from '../../components/AccountBalanceCard';

describe('AccountBalanceCard - بطاقة موقف الحساب والرصيد', () => {
  it('يعرض شارة "خالص" باللون الحيادي عندما يكون الرصيد 0', () => {
    render(
      <AccountBalanceCard
        accountKind="customer"
        balanceBefore={0}
        delta={0}
        balanceAfter={0}
      />
    );

    const badges = screen.getAllByText('خالص');
    expect(badges.length).toBeGreaterThan(0);
    // رمز الثبات •
    expect(screen.getByText('•')).toBeInTheDocument();
  });

  it('يعرض شارة "عليه" للعميل المدين وشارة "له" للعميل الدائن', () => {
    const { rerender } = render(
      <AccountBalanceCard
        accountKind="customer"
        balanceBefore={500} // العميل عليه 500
        delta={200}
        balanceAfter={700}
      />
    );

    expect(screen.getAllByText('عليه').length).toBeGreaterThan(0);
    // رمز الزيادة +
    expect(screen.getByText('+')).toBeInTheDocument();

    // عميل له رصيد دائن (-500)
    rerender(
      <AccountBalanceCard
        accountKind="customer"
        balanceBefore={-500}
        delta={-200}
        balanceAfter={-700}
      />
    );

    expect(screen.getAllByText('له').length).toBeGreaterThan(0);
    // رمز النقصان -
    expect(screen.getByText('-')).toBeInTheDocument();
  });

  it('يعكس دلالة شارات "له" و "عليه" تلقائياً عند تغيير نوع الحساب إلى مورد (supplier)', () => {
    // مورد برصيد موجب (> 0) يعني المورد "له" فلوس
    render(
      <AccountBalanceCard
        accountKind="supplier"
        balanceBefore={1000}
        delta={0}
        balanceAfter={1000}
      />
    );

    expect(screen.getAllByText('له').length).toBeGreaterThan(0);
    expect(screen.queryByText('عليه')).not.toBeInTheDocument();
  });
});
