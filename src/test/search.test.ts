import { describe, it, expect } from 'vitest';
import { matchesSearchQuery, escapePostgrestFilterValue, buildPostgrestOrFilter } from '../lib/search';

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

  it('يهرب الرموز الخاصة في PostgREST (فاصلة، قوس، علامات تنصيص، باك سلاش، ورموز LIKE)', () => {
    // اختبار فاصلة وقوس
    const queryWithCommaAndParen = 'شركة (النور)، فرع القاهرة';
    const escaped1 = escapePostgrestFilterValue(queryWithCommaAndParen);
    expect(escaped1).toBe('"%شركة (النور)، فرع القاهرة%"');

    // اختبار % و _ و " و \
    const complexQuery = 'صنف 50%_خصم "مهم"\\سريع';
    const escaped2 = escapePostgrestFilterValue(complexQuery);
    expect(escaped2).toBe('"%صنف 50\\%\\_خصم \\"مهم\\"\\\\سريع%"');
  });

  it('يبني شرط .or لعدة أعمدة مع تطويق القيمة بعلامات تنصيص', () => {
    const filter = buildPostgrestOrFilter(
      ['name', 'phone', 'serial_number'],
      'شركة (النور)، فرع 1',
    );
    expect(filter).toBe(
      'name.ilike."%شركة (النور)، فرع 1%",phone.ilike."%شركة (النور)، فرع 1%",serial_number.ilike."%شركة (النور)، فرع 1%"',
    );
  });
});
