import { describe, it, expect } from 'vitest';
import { tafqeet } from '../lib/tafqeet';

describe('tafqeet - تفقيط المبالغ المالية بالعربية', () => {
  it('يُرجع نصاً فارغاً عند تمرير صفر أو قيم سالبة أو غير معرفة', () => {
    expect(tafqeet(0)).toBe('');
    expect(tafqeet(-10)).toBe('');
    expect(tafqeet(null)).toBe('');
    expect(tafqeet(undefined)).toBe('');
  });

  it('يفقط الأعداد المفردة (1 و 2 و 3 إلى 10)', () => {
    expect(tafqeet(1)).toBe('فقط جنيه واحد لا غير');
    expect(tafqeet(2)).toBe('فقط جنيهان لا غير');
    expect(tafqeet(5)).toBe('فقط خمسة جنيهات لا غير');
    expect(tafqeet(10)).toBe('فقط عشرة جنيهات لا غير');
  });

  it('يفقط الأعداد المركبة والعقود (11 إلى 99)', () => {
    expect(tafqeet(11)).toBe('فقط أحد عشر جنيهاً لا غير');
    expect(tafqeet(25)).toBe('فقط خمسة وعشرون جنيهاً لا غير');
    expect(tafqeet(99)).toBe('فقط تسعة وتسعون جنيهاً لا غير');
  });

  it('يفقط المئات والآلاف والملايين', () => {
    expect(tafqeet(100)).toBe('فقط مائة جنيه لا غير');
    expect(tafqeet(200)).toBe('فقط مائتان جنيه لا غير');
    expect(tafqeet(350)).toBe('فقط ثلاثمائة وخمسون جنيهاً لا غير');
    expect(tafqeet(1000)).toBe('فقط ألف جنيه لا غير');
    expect(tafqeet(1250)).toBe('فقط ألف ومائتان وخمسون جنيهاً لا غير');
    expect(tafqeet(10000)).toBe('فقط عشرة آلاف جنيه لا غير');
  });

  it('يفقط القروش والكسور العشرية بدقة', () => {
    expect(tafqeet(0.25)).toBe('فقط خمسة وعشرون قرشاً لا غير');
    expect(tafqeet(0.05)).toBe('فقط خمسة قروش لا غير');
    expect(tafqeet(1500.5)).toBe('فقط ألف وخمسمائة جنيه وخمسون قرشاً لا غير');
    expect(tafqeet(120.75)).toBe('فقط مائة وعشرون جنيهاً وخمسة وسبعون قرشاً لا غير');
  });
});
