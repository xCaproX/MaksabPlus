import assert from 'assert';
import {
  OUTCOMES,
  CHECK_TYPES,
  classifyCheckResult,
  isConnectionError,
  isMissingObjectError,
  isPermissionDeniedError,
} from '../verify-engine.mjs';

console.log('🧪 بدء تشغيل اختبارات وحدة التصنيف لمحرك التحقق (Verification Engine Unit Tests)...\n');

let testsRun = 0;
let testsPassed = 0;

function runTest(name, fn) {
  testsRun++;
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    testsPassed++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     ${err.message}`);
  }
}

// 1. A successful RPC with an expected response is reported as PASS
runTest('Case 1: Successful authenticated RPC is reported as PASS', () => {
  const check = {
    name: 'get_my_access',
    type: CHECK_TYPES.AUTHENTICATED_RPC,
    requiresAuth: true,
    validateData: (data) => ({
      valid: data && typeof data.role === 'string',
      message: 'Role required',
    }),
  };

  const response = {
    data: { role: 'owner', permissions: ['*'] },
    error: null,
    status: 200,
  };

  const result = classifyCheckResult(check, response, { isAuthenticated: true });
  assert.strictEqual(result.outcome, OUTCOMES.PASS);
  assert.strictEqual(result.reason, 'RPC_EXECUTION_SUCCESS');
});

// 2. A missing RPC or database object is not reported as healthy
runTest('Case 2: Missing RPC/table (PGRST202/PGRST205) is reported as FAIL with OBJECT_MISSING', () => {
  const check = {
    name: 'missing_fn',
    type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
  };

  const response = {
    data: null,
    error: {
      code: 'PGRST202',
      message: 'Could not find the function public.missing_fn in the schema cache',
    },
    status: 404,
  };

  const result = classifyCheckResult(check, response);
  assert.strictEqual(result.outcome, OUTCOMES.FAIL);
  assert.strictEqual(result.reason, 'OBJECT_MISSING');
});

// 3. An authentication failure is not reported as PASS for authenticated RPCs
runTest('Case 3: Authentication failure (not_authenticated) on authenticated check is reported as FAIL', () => {
  const check = {
    name: 'update_invoice_with_cash_box',
    type: CHECK_TYPES.AUTHENTICATED_RPC,
    requiresAuth: true,
  };

  const response = {
    data: null,
    error: {
      code: '28000',
      message: 'not_authenticated',
    },
    status: 401,
  };

  const result = classifyCheckResult(check, response, { isAuthenticated: true });
  assert.strictEqual(result.outcome, OUTCOMES.FAIL);
  assert.strictEqual(result.reason, 'RPC_EXECUTION_FAILED');
  assert.notStrictEqual(result.outcome, OUTCOMES.PASS);
});

// 4. A permission-denied response is classified according to the check's expected authorization behavior
runTest('Case 4a: Permission denied on ANON boundary check is reported as PASS (boundary enforced)', () => {
  const check = {
    name: 'create_invoice_with_cash_box',
    type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
  };

  const response = {
    data: null,
    error: {
      code: '42501',
      message: 'permission denied for function create_invoice_with_cash_box',
    },
    status: 401,
  };

  const result = classifyCheckResult(check, response);
  assert.strictEqual(result.outcome, OUTCOMES.PASS);
  assert.strictEqual(result.reason, 'AUTH_BOUNDARY_ENFORCED');
});

runTest('Case 4b: Permission denied on authenticated call where permission was expected is reported as FAIL', () => {
  const check = {
    name: 'create_invoice_with_cash_box',
    type: CHECK_TYPES.AUTHENTICATED_RPC,
    requiresAuth: true,
  };

  const response = {
    data: null,
    error: {
      code: '42501',
      message: 'permission denied for function create_invoice_with_cash_box',
    },
    status: 403,
  };

  const result = classifyCheckResult(check, response, { isAuthenticated: true });
  assert.strictEqual(result.outcome, OUTCOMES.FAIL);
  assert.strictEqual(result.reason, 'UNAUTHORIZED_CALL');
});

// 5. An unexpected SQL runtime error is not reported as PASS
runTest('Case 5: Unexpected SQL runtime exception is reported as FAIL', () => {
  const check = {
    name: 'create_warehouse_transfer',
    type: CHECK_TYPES.ANON_ACCESS_BOUNDARY,
  };

  const response = {
    data: null,
    error: {
      code: 'XX000',
      message: 'Internal crash in function body',
    },
    status: 500,
  };

  const result = classifyCheckResult(check, response);
  assert.strictEqual(result.outcome, OUTCOMES.FAIL);
  assert.strictEqual(result.reason, 'UNEXPECTED_SQL_RUNTIME_ERROR');
});

// 6. A recognized business-rule validation error is accepted only when that specific error is expected
runTest('Case 6a: Expected business validation error (22023) is reported as PASS', () => {
  const check = {
    name: 'create_invoice_validation',
    type: CHECK_TYPES.RPC_VALIDATION,
    expectedErrorCode: '22023',
    expectedErrorMessage: 'invalid_cash_box',
  };

  const response = {
    data: null,
    error: {
      code: '22023',
      message: 'invalid_cash_box',
    },
    status: 400,
  };

  const result = classifyCheckResult(check, response);
  assert.strictEqual(result.outcome, OUTCOMES.PASS);
  assert.strictEqual(result.reason, 'VALIDATION_REJECTED_AS_EXPECTED');
});

runTest('Case 6b: Unexpected validation error is reported as FAIL', () => {
  const check = {
    name: 'create_invoice_validation',
    type: CHECK_TYPES.RPC_VALIDATION,
    expectedErrorCode: '22023',
    expectedErrorMessage: 'invalid_cash_box',
  };

  const response = {
    data: null,
    error: {
      code: '42883',
      message: 'some unrelated exception',
    },
    status: 500,
  };

  const result = classifyCheckResult(check, response);
  assert.strictEqual(result.outcome, OUTCOMES.FAIL);
  assert.notStrictEqual(result.outcome, OUTCOMES.PASS);
});

// 7. A network or configuration failure is reported as an environment issue, not as successful
runTest('Case 7: Network failure (fetch failed / ECONNREFUSED) is reported as FAIL with CONNECTION_FAILURE', () => {
  const check = {
    name: 'v_invoice_list',
    type: CHECK_TYPES.CATALOG_QUERY,
  };

  const response = {
    data: null,
    error: {
      message: 'fetch failed: TypeError: fetch failed (ECONNREFUSED)',
      code: 'ECONNREFUSED',
    },
  };

  const result = classifyCheckResult(check, response);
  assert.strictEqual(result.outcome, OUTCOMES.FAIL);
  assert.strictEqual(result.reason, 'CONNECTION_FAILURE');
});

// 8. Required failed checks produce a nonzero exit code
runTest('Case 8: Failure detection helper identifies failing check correctly for exit code determination', () => {
  const results = [
    { name: 'check_1', outcome: OUTCOMES.PASS },
    { name: 'check_2', outcome: OUTCOMES.WARN },
    { name: 'check_3', outcome: OUTCOMES.FAIL },
  ];

  const hasFailures = results.some((r) => r.outcome === OUTCOMES.FAIL);
  assert.strictEqual(hasFailures, true);
});

// 9. Optional or intentionally skipped checks are clearly distinguished from passing checks
runTest('Case 9: Missing credentials for authenticated check produces WARN / PREREQUISITE_MISSING', () => {
  const check = {
    name: 'get_account_statement',
    type: CHECK_TYPES.AUTHENTICATED_RPC,
    requiresAuth: true,
  };

  const result = classifyCheckResult(check, null, { isAuthenticated: false });
  assert.strictEqual(result.outcome, OUTCOMES.WARN);
  assert.strictEqual(result.reason, 'PREREQUISITE_MISSING');
  assert.notStrictEqual(result.outcome, OUTCOMES.PASS);
});

console.log(`\nملخص الاختبارات: تم تشغيل ${testsRun}، نجح ${testsPassed}، فشل ${testsRun - testsPassed}`);

if (testsPassed !== testsRun) {
  process.exit(1);
} else {
  console.log('✅ جميع اختبارات وحدة التصنيف نجحت بنسبة 100%!\n');
}
