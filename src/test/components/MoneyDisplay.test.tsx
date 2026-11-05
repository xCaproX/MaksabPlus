import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MoneyDisplay from '../../components/MoneyDisplay';

describe('MoneyDisplay Component', () => {
  it('يعرض القيمة الرقمية المنسقة بنظام العملة الإنجليزية مع dir="ltr" وعزل bdi', () => {
    const { container } = render(<MoneyDisplay value={1250.75} />);
    const root = container.querySelector('span.num');
    expect(root).toBeInTheDocument();
    expect(root).toHaveAttribute('dir', 'ltr');
    expect(screen.getByText('1,250.75')).toBeInTheDocument();
  });

  it('يعرض 0.00 بأمان عند تمرير null أو undefined أو قيمة غير رقمية', () => {
    const { rerender } = render(<MoneyDisplay value={null} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();

    rerender(<MoneyDisplay value={undefined} />);
    expect(screen.getByText('0.00')).toBeInTheDocument();

    rerender(<MoneyDisplay value="invalid" />);
    expect(screen.getByText('0.00')).toBeInTheDocument();
  });

  it('يعرض المبالغ السالبة مع إبقاء إشارة السالب سليمة ومنع تشوه BiDi', () => {
    render(<MoneyDisplay value={-450.5} />);
    expect(screen.getByText('-450.50')).toBeInTheDocument();
  });

  it('يعرض رمز العملة "ج.م" خارج الرقم عند تمرير currency=true', () => {
    render(<MoneyDisplay value={100} currency />);
    expect(screen.getByText('100.00')).toBeInTheDocument();
    expect(screen.getByText('ج.م')).toBeInTheDocument();
  });

  it('يطبق كلاس strong وكلاس مخصص إضافي عند تمريرهما', () => {
    const { container } = render(<MoneyDisplay value={50} strong className="remaining-amount" />);
    const span = container.querySelector('span.num');
    expect(span).toHaveClass('strong');
    expect(span).toHaveClass('remaining-amount');
  });
});
