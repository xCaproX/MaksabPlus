import { describe, it, expect } from 'vitest';
import {
  PERMISSION_SECTIONS,
  PERMISSION_PRESETS,
  getAllPermissionKeys,
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
