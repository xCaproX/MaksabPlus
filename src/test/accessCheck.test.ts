import { describe, it, expect } from 'vitest';
import { hasPermission, type AccessState } from '../lib/accessCheck';

describe('accessCheck - حوكمة الصلاحيات والأمان', () => {
  it('يرفض الصلاحية فوراً إذا لم توجد جلسة مستخدم (null أو undefined)', () => {
    expect(hasPermission(null, 'goods.sale.view')).toBe(false);
    expect(hasPermission(undefined, 'goods.sale.view')).toBe(false);
  });

  it('يمنح مالك الشركة (owner) الصلاحية الكاملة دائماً لكافة العمليات', () => {
    const ownerAccess: AccessState = { role: 'owner', permissions: [] };
    expect(hasPermission(ownerAccess, 'goods.sale.create')).toBe(true);
    expect(hasPermission(ownerAccess, 'management.items.edit')).toBe(true);
    expect(hasPermission(ownerAccess, 'any.unlisted.permission')).toBe(true);
  });

  it('يمنح المستخدم الصلاحية إذا كان يمتلك الرمز الشامل "*"', () => {
    const wildcardAccess: AccessState = { role: 'employee', permissions: ['*'] };
    expect(hasPermission(wildcardAccess, 'goods.waste.delete')).toBe(true);
  });

  it('يطابق الصلاحيات التفصيلية بدقة عند منحها للموظف', () => {
    const salesEmployee: AccessState = {
      role: 'employee',
      permissions: ['goods.sale.view', 'goods.sale.create', 'money.in.view'],
    };

    expect(hasPermission(salesEmployee, 'goods.sale.view')).toBe(true);
    expect(hasPermission(salesEmployee, 'goods.sale.create')).toBe(true);
    expect(hasPermission(salesEmployee, 'money.in.view')).toBe(true);

    // الصلاحيات غير الممنوحة يتم حظرها
    expect(hasPermission(salesEmployee, 'goods.sale.delete')).toBe(false);
    expect(hasPermission(salesEmployee, 'goods.purchase.view')).toBe(false);
  });

  it('يدعم وراثة الصلاحية من القسم الأب (Parent Key Fallback)', () => {
    // إذا مُنح الموظف 'goods.view' فهذا يمنحه عرض فواتير المبيعات والمشتريات
    const broadGoodsViewer: AccessState = {
      role: 'employee',
      permissions: ['goods.view'],
    };

    expect(hasPermission(broadGoodsViewer, 'goods.sale.view')).toBe(true);
    expect(hasPermission(broadGoodsViewer, 'goods.purchase.view')).toBe(true);
    expect(hasPermission(broadGoodsViewer, 'goods.waste.view')).toBe(true);

    // لكن لا يمنحه إنشاء أو تعديل
    expect(hasPermission(broadGoodsViewer, 'goods.sale.create')).toBe(false);
  });

  it('يدعم المطابقة العكسية عند طلب صلاحية عامة وممتلك الموظف تفريعة فرعية (Reverse Subtab Match)', () => {
    // حالة الموظف الممنوح دليل العملاء والأصناف فقط
    const granularEmployee: AccessState = {
      role: 'employee',
      permissions: ['data.customers.view', 'data.items.view'],
    };

    // يجب أن تمنحه الدخول لقسم البيانات الأساسية (data.view)
    expect(hasPermission(granularEmployee, 'data.view')).toBe(true);

    // لكن لا تمنحه صلاحية التعديل العام أو الحذف إذا لم تُمنح له
    expect(hasPermission(granularEmployee, 'data.edit')).toBe(false);
    expect(hasPermission(granularEmployee, 'data.delete')).toBe(false);

    // ولا تمنحه دخول الأقسام الأخرى التي ليس لديه أي صلاحية فيها
    expect(hasPermission(granularEmployee, 'balances.view')).toBe(false);
    expect(hasPermission(granularEmployee, 'management.view')).toBe(false);
  });

  it('يتحقق من وجود أي من الصلاحيات المتعددة المطلوبة (OR logic)', () => {
    const employee: AccessState = {
      role: 'employee',
      permissions: ['money.in.view'],
    };

    // هل يملك 'goods.sale.view' أو 'money.in.view'؟
    expect(hasPermission(employee, 'goods.sale.view', 'money.in.view')).toBe(true);
    // هل يملك 'goods.sale.view' أو 'goods.purchase.view'؟
    expect(hasPermission(employee, 'goods.sale.view', 'goods.purchase.view')).toBe(false);
  });
});
