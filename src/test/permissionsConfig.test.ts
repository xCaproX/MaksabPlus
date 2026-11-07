import { describe, it, expect } from 'vitest';
import {
  PERMISSION_SECTIONS,
  PERMISSION_PRESETS,
  getAllPermissionKeys,
  getActionColumnKeys,
  getItemPermissionKeys,
  getSectionPermissionKeys,
  togglePermissionKeys,
} from '../lib/permissionsConfig';

describe('permissionsConfig - هيكل وقوالب الصلاحيات', () => {
  it('يحتوي على كافة الأقسام الرئيسية الخمسة للنظام', () => {
    const sectionIds = PERMISSION_SECTIONS.map((s) => s.id);
    expect(sectionIds).toContain('goods');
    expect(sectionIds).toContain('money');
    expect(sectionIds).toContain('data');
    expect(sectionIds).toContain('balances');
    expect(sectionIds).toContain('management');
  });

  it('يجمع كافة مفاتيح الصلاحيات دون تكرار أو قيم فارغة', () => {
    const allKeys = getAllPermissionKeys();
    expect(allKeys.length).toBeGreaterThan(30);

    const uniqueKeys = new Set(allKeys);
    expect(uniqueKeys.size).toBe(allKeys.length);

    allKeys.forEach((key) => {
      expect(key).toMatch(/^[a-zA-Z_]+(\.[a-zA-Z_]+)+$/);
    });
  });

  it('تحتوي كافة القوالب السريعة (PRESETS) على مفاتيح صالحة ومطابقة لأقسام النظام', () => {
    const validKeysSet = new Set(getAllPermissionKeys());

    PERMISSION_PRESETS.forEach((preset) => {
      expect(preset.keys.length).toBeGreaterThan(0);
      preset.keys.forEach((key) => {
        expect(
          validKeysSet.has(key),
          `المفتاح ${key} في القالب ${preset.id} غير معرف ضمن أقسام الصلاحيات`
        ).toBe(true);
      });
    });
  });
});

describe('permissionsConfig - مساعدات تبديل الصلاحيات', () => {
  const goods = PERMISSION_SECTIONS.find((s) => s.id === 'goods')!;
  const saleItem = goods.items.find((i) => i.id === 'goods.sale')!;

  it('مفاتيح البند = كل أفعاله الظاهرة فقط', () => {
    const keys = getItemPermissionKeys(saleItem);
    expect(keys).toEqual(saleItem.actions.map((act) => `goods.sale.${act}`));
    expect(getSectionPermissionKeys(goods)).toEqual(goods.items.flatMap(getItemPermissionKeys));
  });

  it('مفاتيح عمود الفعل تلتزم بالأقسام التي تحتوي الفعل فقط', () => {
    const viewKeys = getActionColumnKeys(PERMISSION_SECTIONS, 'view');
    // كل مفتاح رجعه لازم يكون view
    expect(viewKeys.length).toBeGreaterThan(0);
    viewKeys.forEach((key) => expect(key.endsWith('.view')).toBe(true));
  });

  it('togglePermissionKeys: الحذف لما الكل متفعل، والإضافة للناقص فقط', () => {
    const keys = getItemPermissionKeys(saleItem);
    const activated = togglePermissionKeys([], keys);
    keys.forEach((k) => expect(activated).toContain(k));

    // الجزئي: نفعّل أول مفتاح فقط ثم نبدّل → يكمل باقي المفاتيح بدون تكرار
    const partial = togglePermissionKeys([keys[0]], keys);
    keys.forEach((k) => expect(partial).toContain(k));
    expect(partial.filter((k) => k === keys[0]).length).toBe(1);

    // الكل متفعل → يُشالوا كلهم
    const removed = togglePermissionKeys([...keys], keys);
    expect(removed).toEqual([]);
  });
});
