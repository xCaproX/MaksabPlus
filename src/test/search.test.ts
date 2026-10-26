import { describe, it, expect } from 'vitest';
import { matchesSearchQuery } from '../lib/search';

describe('search - محرك البحث العربي والمطابقة', () => {
  it('يُرجع true عند ترك استعلام البحث فارغاً', () => {
    expect(matchesSearchQuery(['أحمد', '01000000000'], '')).toBe(true);
    expect(matchesSearchQuery(['أحمد'], '   ')).toBe(true);
  });

  it('يطابق النصوص باللغة العربية مع تجاهل المسافات وحالة الأحرف', () => {
    const fields = ['شركة النور للتجارة', '0123456789', 'فاتورة نقدية'];

    expect(matchesSearchQuery(fields, 'النور')).toBe(true);
    expect(matchesSearchQuery(fields, 'نقدية')).toBe(true);
    expect(matchesSearchQuery(fields, '1234')).toBe(true);
    expect(matchesSearchQuery(fields, 'الأمل')).toBe(false);
  });

  it('يتعامل بأمان مع الحقول الخالية (null و undefined والأرقام)', () => {
    const fields = [null, undefined, 502, 'مخزن رئيسي'];

    expect(matchesSearchQuery(fields, '502')).toBe(true);
    expect(matchesSearchQuery(fields, 'رئيسي')).toBe(true);
    expect(matchesSearchQuery(fields, 'فرعي')).toBe(false);
  });
});
