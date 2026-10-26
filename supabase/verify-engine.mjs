/**
 * محرك التحقق وتصنيف نتائج فحوصات قاعدة البيانات
 * يفصل بوضوح بين:
 * 1. وجود الكائن وسلامة سلوكه
 * 2. وجود الكائن مع فشل تنفيذه
 * 3. حظر الوصول لعدم وجود صلاحية (حسب المتوقع)
 * 4. فقدان الكائن من المخطط (Schema)
 * 5. أخطاء البيئة والاتصال
 */

export const OUTCOMES = {
  PASS: 'PASS',
  FAIL: 'FAIL',
  WARN: 'WARN',
  SKIP: 'SKIP',
};

export const CHECK_TYPES = {
  // فحص استعلام قراءة من جدول/عرض
  CATALOG_QUERY: 'CATALOG_QUERY',
  // فحص حظر الوصول غير المصرح به لدوال الـ RPC الحساسة (Boundary Check)
  ANON_ACCESS_BOUNDARY: 'ANON_ACCESS_BOUNDARY',
  // فحص استدعاء دالة لمستخدم موثق (Authenticated Execution)
  AUTHENTICATED_RPC: 'AUTHENTICATED_RPC',
  // فحص التحقق من صحة المدخلات ورفضها بخطأ عمل متوقع (Business Validation)
  RPC_VALIDATION: 'RPC_VALIDATION',
};

/**
 * تحديد ما إذا كان الخطأ يدل على مشكلة شبكة أو اتصال
 */
export function isConnectionError(err) {
  if (!err) return false;
  const msg = (err.message || '').toLowerCase();
  const code = String(err.code || '').toUpperCase();
  return (
    code === 'ENOTFOUND' ||
    code === 'ECONNREFUSED' ||
    code === 'ETIMEDOUT' ||
    code === 'ECONNRESET' ||
    err.name === 'AbortError' ||
    msg.includes('fetch failed') ||
    msg.includes('network error') ||
    msg.includes('connection refused') ||
    msg.includes('failed to fetch')
  );
}

/**
 * تحديد ما إذا كان الخطأ ناتج عن عدم وجود الكائن أو الحقل في الـ Schema
 */
export function isMissingObjectError(err) {
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  const msg = (err.message || '').toLowerCase();
  return (
    code === 'PGRST202' || // Function not found in schema cache
    code === 'PGRST205' || // Table/view not found in schema cache
    code === 'PGRST204' || // Column not found
    code === '42P01' ||    // PostgreSQL undefined_table
    code === '42703' ||    // PostgreSQL undefined_column
    code === '42883' ||    // PostgreSQL undefined_function
    msg.includes('schema cache') ||
    msg.includes('does not exist') ||
    msg.includes('could not find the function') ||
    msg.includes('could not find the table')
  );
}

/**
 * تحديد ما إذا كان الخطأ ناتج عن حظر صلاحيات الوصول
 */
export function isPermissionDeniedError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const status = Number(err.status || 0);
  const msg = (err.message || '').toLowerCase();
  return (
    code === '42501' || // PostgreSQL insufficient_privilege
    status === 401 ||
    status === 403 ||
    msg.includes('permission denied') ||
    msg.includes('not authorized')
  );
}

/**
 * تحديد ما إذا كان الخطأ ناتج عن عدم التوثيق / غياب جلسة المستخدم
 */
export function isNotAuthenticatedError(err) {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = (err.message || '').toLowerCase();
  return (
    code === '28000' || // PostgreSQL invalid_authorization_specification
    code === 'PGRST301' || // JWT expired / missing
    msg.includes('not_authenticated') ||
    msg.includes('jwt')
  );
}

/**
 * تصنيف نتيجة الفحص وفق المتطلبات والمعايير الدقيقة
 * @param {Object} checkDef تعريف الفحص ومتطلباته
 * @param {Object} response نتيجة الاستدعاء من Supabase { data, error, status }
 * @param {Object} [context] سياق الفحص (هل المستخدم موثق؟ إلخ)
 * @returns {{ outcome: string, reason: string, diagnostic: string }}
 */
export function classifyCheckResult(checkDef, response, context = {}) {
  // فحص متطلب التوثيق
  if (checkDef.requiresAuth && !context.isAuthenticated) {
    return {
      outcome: OUTCOMES.WARN,
      reason: 'PREREQUISITE_MISSING',
      diagnostic: 'تم تخطي الفحص لعدم توفر بيانات مستخدم موثق (TEST_USER_EMAIL / TEST_USER_PASSWORD)',
    };
  }

  const res = response || {};
  const err = res.error;

  // 1. معالجة أخطاء الشبكة والاتصال
  if (isConnectionError(err)) {
    return {
      outcome: OUTCOMES.FAIL,
      reason: 'CONNECTION_FAILURE',
      diagnostic: `فشل الاتصال بالخادم: ${err.message}`,
    };
  }

  // 2. التحقق مما إذا كان الكائن مفقوداً من الـ Schema
  if (isMissingObjectError(err)) {
    return {
      outcome: OUTCOMES.FAIL,
      reason: 'OBJECT_MISSING',
      diagnostic: `الكائن أو الحقل غير موجود في قاعدة البيانات: ${err.message}`,
    };
  }

  // 3. فحص حدود الوصول غير المصرح به (ANON_ACCESS_BOUNDARY)
  if (checkDef.type === CHECK_TYPES.ANON_ACCESS_BOUNDARY) {
    // إذا نجح الاستدعاء وأرجع بيانات لمستخدم مجهول، فهذا خرق أمني!
    if (!err) {
      return {
        outcome: OUTCOMES.FAIL,
        reason: 'SECURITY_EXPOSURE',
        diagnostic: 'ثغرة أمنية: تم السماح للوصول العام غير الموثق بتنفيذ دالة حساسة بدون أي رفض!',
      };
    }

    // الرفض بـ 42501 (Permission Denied) أو 28000 (Not Authenticated) هو السلوك المطلوب أمنياً
    if (isPermissionDeniedError(err) || isNotAuthenticatedError(err)) {
      return {
        outcome: OUTCOMES.PASS,
        reason: 'AUTH_BOUNDARY_ENFORCED',
        diagnostic: 'تم التحقق من حظر الوصول العام بنجاح (الكائن محمي ومقيد للمستخدمين الموثقين فقط)',
      };
    }

    // إذا أعاد خطأ SQL آخر غير متوقع (مثل خطأ بناء أو تحطم داخلي)
    return {
      outcome: OUTCOMES.FAIL,
      reason: 'UNEXPECTED_SQL_RUNTIME_ERROR',
      diagnostic: `خطأ تنفيذي غير متوقع في الدالة: [${err.code || 'UNKNOWN'}] ${err.message}`,
    };
  }

  // 4. استعلامات القراءة والمخطط (CATALOG_QUERY)
  if (checkDef.type === CHECK_TYPES.CATALOG_QUERY) {
    if (err) {
      return {
        outcome: OUTCOMES.FAIL,
        reason: 'QUERY_FAILED',
        diagnostic: `فشل الاستعلام من الجدول أو العرض: [${err.code || 'UNKNOWN'}] ${err.message}`,
      };
    }

    if (checkDef.validateData) {
      const validation = checkDef.validateData(res.data);
      if (!validation.valid) {
        return {
          outcome: OUTCOMES.FAIL,
          reason: 'DATA_VALIDATION_FAILED',
          diagnostic: validation.message || 'بيانات العرض غير مطابقة للهيكل المتوقع',
        };
      }
    }

    return {
      outcome: OUTCOMES.PASS,
      reason: 'QUERY_SUCCESS',
      diagnostic: 'تم التحقق من وجود الكائن والأعمدة المطلوبة بنجاح',
    };
  }

  // 5. فحص التحقق من صحة المدخلات وقواعد العمل (RPC_VALIDATION)
  if (checkDef.type === CHECK_TYPES.RPC_VALIDATION) {
    if (!err) {
      return {
        outcome: OUTCOMES.FAIL,
        reason: 'VALIDATION_BYPASSED',
        diagnostic: 'فشل الفحص: كان من المتوقع رفض المدخلات غير الصحيحة لكن الدالة قبلتها!',
      };
    }

    const matchesCode = checkDef.expectedErrorCode && String(err.code) === String(checkDef.expectedErrorCode);
    const matchesMsg = checkDef.expectedErrorMessage && (err.message || '').includes(checkDef.expectedErrorMessage);

    if (matchesCode || matchesMsg) {
      return {
        outcome: OUTCOMES.PASS,
        reason: 'VALIDATION_REJECTED_AS_EXPECTED',
        diagnostic: `تم رفض المدخلات غير الصحيحة بقاعدة التحقق المتوقعة [${err.code || ''}]`,
      };
    }

    // إذا كان الخطأ رفض وصول بدلاً من رفض مدخلات
    if (isPermissionDeniedError(err)) {
      return {
        outcome: OUTCOMES.FAIL,
        reason: 'PERMISSION_DENIED_INSTEAD_OF_VALIDATION',
        diagnostic: `تم حظر الاستدعاء لعدم وجود صلاحية بدلاً من التحقق من المدخلات: ${err.message}`,
      };
    }

    return {
      outcome: OUTCOMES.FAIL,
      reason: 'UNEXPECTED_VALIDATION_ERROR',
      diagnostic: `أعادت الدالة خطأ مختلف عن قاعدة التحقق المتوقعة: [${err.code || 'UNKNOWN'}] ${err.message}`,
    };
  }

  // 6. استدعاءات الدوال للمستخدم الموثق (AUTHENTICATED_RPC)
  if (checkDef.type === CHECK_TYPES.AUTHENTICATED_RPC) {
    if (err) {
      if (isPermissionDeniedError(err)) {
        return {
          outcome: OUTCOMES.FAIL,
          reason: 'UNAUTHORIZED_CALL',
          diagnostic: `المستخدم الموثق لا يملك صلاحية تنفيذ الدالة: ${err.message}`,
        };
      }

      return {
        outcome: OUTCOMES.FAIL,
        reason: 'RPC_EXECUTION_FAILED',
        diagnostic: `فشل تنفيذ الدالة للمستخدم الموثق: [${err.code || 'UNKNOWN'}] ${err.message}`,
      };
    }

    if (checkDef.validateData) {
      const validation = checkDef.validateData(res.data);
      if (!validation.valid) {
        return {
          outcome: OUTCOMES.FAIL,
          reason: 'DATA_VALIDATION_FAILED',
          diagnostic: validation.message || 'بيانات الدالة غير مطابقة للمتوقع',
        };
      }
    }

    return {
      outcome: OUTCOMES.PASS,
      reason: 'RPC_EXECUTION_SUCCESS',
      diagnostic: 'تم استدعاء الدالة وتنفيذها بنجاح واجتياز اختبار البيانات',
    };
  }

  // نوع غير معروف
  return {
    outcome: OUTCOMES.FAIL,
    reason: 'UNKNOWN_CHECK_TYPE',
    diagnostic: `نوع الفحص غير معروف: ${checkDef.type}`,
  };
}
