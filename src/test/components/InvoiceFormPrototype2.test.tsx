import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import InvoiceFormPrototype2, { type Inv2Account, type Inv2CashBox, type Inv2Item } from '../../components/InvoiceFormPrototype2';

const accounts: Inv2Account[] = [
  { id: 'a1', kind: 'customer', code: '000006', name: 'جودت', balance: 4041 },
];
const items: Inv2Item[] = [
  { id: 'i1', code: '000121', name: 'بلح', unit: 'كجم', available: 2295, cost: 44.78, showroomPrice: 54.5 },
  { id: 'i2', code: '000175', name: 'عسل', unit: 'برطمان', available: 204, cost: 57.51, showroomPrice: 73 },
  { id: 'i3', code: '000228', name: 'حبة البركة', unit: 'برطمان', available: 1, cost: 20.75, showroomPrice: 30 },
];
const cashBoxes: Inv2CashBox[] = [{ id: 'c1', name: 'الخزنة الرئيسية', balance: 1000 }];

function setup() {
  render(<InvoiceFormPrototype2 accounts={accounts} items={items} cashBoxes={cashBoxes} warehouses={['المخزن الرئيسي']} />);
  const summary = screen.getByLabelText('ملخص الفاتورة');
  return { summary };
}

describe('InvoiceFormPrototype2', () => {
  it('يطابق أرقام شاشة الأكسس: خصم 12.50 ← صافي 1,200.00 ومتبقي 200.00', () => {
    const { summary } = setup();
    expect(within(summary).getByText('1,212.50')).toBeTruthy();
    expect((within(summary).getByLabelText('قيمة الخصم') as HTMLInputElement).value).toBe('12.50');
    expect((within(summary).getByLabelText('نسبة الخصم') as HTMLInputElement).value).toBe('1.03');
    expect(within(summary).getAllByText('1,200.00').length).toBeGreaterThan(0);
    expect(within(summary).getAllByText('200.00').length).toBeGreaterThan(0);
  });

  it('يعرض رصيد العميل قبل وبعد الفاتورة بنص صريح عليه/له', () => {
    setup();
    expect(screen.getByText('4,041.00 ج.م عليه')).toBeTruthy();
    expect(screen.getByText('4,241.00 ج.م عليه')).toBeTruthy();
  });

  it('تعديل نسبة الخصم يحوّلها لمصدر الحساب ويحدّث القيمة', () => {
    const { summary } = setup();
    const pct = within(summary).getByLabelText('نسبة الخصم') as HTMLInputElement;
    fireEvent.focus(pct);
    fireEvent.change(pct, { target: { value: '10' } });
    expect((within(summary).getByLabelText('قيمة الخصم') as HTMLInputElement).value).toBe('121.25');
  });

  it('زر دفع بالكامل يصفّر المتبقي', () => {
    const { summary } = setup();
    fireEvent.click(within(summary).getByText('دفع بالكامل'));
    expect((within(summary).getByLabelText('قيمة الخصم') as HTMLInputElement).value).toBe('12.50');
    expect((document.getElementById('inv2-paid') as HTMLInputElement).value).toBe('1200.00');
  });

  it('لا يكرر نفس الصنف: إضافته مرة ثانية تزوّد الكمية', () => {
    setup();
    const search = screen.getByLabelText('إضافة صنف');
    fireEvent.change(search, { target: { value: '[000121] بلح' } });
    expect((screen.getByLabelText('كمية بلح') as HTMLInputElement).value).toBe('16');
    expect(screen.getAllByLabelText('كمية بلح').length).toBe(1);
  });

  it('يحذّر عندما تزيد الكمية عن المتاح', () => {
    setup();
    fireEvent.change(screen.getByLabelText('كمية حبة البركة'), { target: { value: '5' } });
    expect(screen.getByRole('alert').textContent).toContain('الكمية أكبر من المتاح');
  });

  it('أزرار الطباعة معطلة حتى الحفظ', () => {
    setup();
    const a4 = screen.getByRole('button', { name: /A4/ }) as HTMLButtonElement;
    expect(a4.disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /حفظ الفاتورة/ }));
    expect(a4.disabled).toBe(false);
  });
});
