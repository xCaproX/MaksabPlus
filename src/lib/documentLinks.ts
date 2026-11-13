import { supabase } from './supabase';
import { errorMessage } from './errors';

export type DocumentDetailScope =
  | 'invoice'
  | 'receipt'
  | 'warehouse_transfer'
  | 'cash_box_transfer';

export type DocumentDetailStatus =
  | 'ok'
  | 'not_found'
  | 'forbidden'
  | 'deleted_forbidden';

export type DocumentDetailFetchResult =
  | {
      ok: true;
      doc: Record<string, unknown>;
      lines: Array<Record<string, unknown>>;
    }
  | {
      ok: false;
      status: Exclude<DocumentDetailStatus, 'ok'> | 'error';
      message: string;
    };

const STATUS_MESSAGES: Record<Exclude<DocumentDetailStatus, 'ok'>, string> = {
  not_found: 'المستند المطلوب غير موجود',
  forbidden: 'لا تملك صلاحية عرض هذا المستند',
  deleted_forbidden: 'هذا المستند محذوف ولا تملك صلاحية عرضه أو استعادته',
};

const INVOICE_STATEMENT_KINDS = new Set([
  'sale',
  'purchase',
  'sale_return',
  'purchase_return',
  'waste',
]);

/** يبني رابط الانتقال الآمن من سطر كشف الحساب/الخزنة/الصنف مع مراعاة صلاحيات العرض. */
export function getStatementRowLink(
  docId?: string | null,
  docKind?: string | null,
  can?: (permission: string) => boolean,
): string | null {
  if (!docId || !docKind) return null;

  if (INVOICE_STATEMENT_KINDS.has(docKind)) {
    if (can && !can(`goods.${docKind}.view`)) return null;
    return `/invoices?tab=${docKind}&doc=${encodeURIComponent(docId)}`;
  }

  if (docKind === 'warehouse_transfer') {
    if (can && !can('goods.warehouse_transfer.view')) return null;
    return `/invoices?tab=warehouse_transfer&doc=${encodeURIComponent(docId)}`;
  }

  if (docKind === 'in' || docKind === 'out') {
    if (can && !can(`money.${docKind}.view`)) return null;
    return `/receipts?tab=${docKind}&doc=${encodeURIComponent(docId)}`;
  }

  if (docKind === 'cash_box_transfer') {
    if (can && !can('money.cash_box_transfer.view')) return null;
    return `/receipts?tab=cash_box_transfer&doc=${encodeURIComponent(docId)}`;
  }

  return null;
}

/** يجلب تفاصيل مستند عبر دالة قاعدة البيانات الموحدة للروابط العميقة مع التحقق من الشركة والصلاحيات. */
export async function fetchDocumentDetail(
  scope: DocumentDetailScope,
  docId: string,
): Promise<DocumentDetailFetchResult> {
  const { data, error } = await supabase.rpc('get_document_detail', {
    p_scope: scope,
    p_doc_id: docId,
  });

  if (error) {
    return {
      ok: false,
      status: 'error',
      message: errorMessage(error),
    };
  }

  const payload = (data ?? {}) as {
    status?: DocumentDetailStatus;
    doc?: Record<string, unknown>;
    lines?: Array<Record<string, unknown>>;
  };

  if (payload.status === 'ok' && payload.doc) {
    return {
      ok: true,
      doc: payload.doc,
      lines: Array.isArray(payload.lines) ? payload.lines : [],
    };
  }

  const deniedStatus =
    payload.status === 'forbidden' || payload.status === 'deleted_forbidden'
      ? payload.status
      : 'not_found';

  return {
    ok: false,
    status: deniedStatus,
    message: STATUS_MESSAGES[deniedStatus],
  };
}
