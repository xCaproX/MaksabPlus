import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import AccountBalancePills from '../../components/AccountBalancePills';

describe('AccountBalancePills Component', () => {
  it('يعرض شارات المديونية قبل وبعد وصافي الفاتورة بشكل صحيح', () => {
    render(
      <AccountBalancePills
        accountKind="customer"
        balanceBefore={500}
        delta={200}
        balanceAfter={700}
        titleBefore="المديونية قبل:"
        deltaLabel="صافي الفاتورة:"
        titleAfter="المديونية بعد:"
      />
    );

    expect(screen.getByText('المديونية قبل:')).toBeInTheDocument();
    expect(screen.getByText('صافي الفاتورة:')).toBeInTheDocument();
    expect(screen.getByText('المديونية بعد:')).toBeInTheDocument();

    expect(screen.getByText('500.00')).toBeInTheDocument();
    expect(screen.getByText('200.00')).toBeInTheDocument();
    expect(screen.getByText('700.00')).toBeInTheDocument();

    const badges = screen.getAllByText('عليه');
    expect(badges.length).toBe(2);
  });

  it('يعرض شارة خالص عند تصفير الرصيد', () => {
    render(
      <AccountBalancePills
        accountKind="customer"
        balanceBefore={500}
        delta={-500}
        balanceAfter={0}
      />
    );

    expect(screen.getByText('خالص')).toBeInTheDocument();
  });
});
