export interface CountedPage<Row> {
  data: Row[] | null;
  count: number | null;
  error: { message: string } | null;
}

/** Advance by rows received, so a server row cap cannot silently truncate results. */
export async function collectAllRows<Row>(
  fetchPage: (from: number, to: number) => PromiseLike<CountedPage<Row>>,
) {
  const rows: Row[] = [];
  let expected: number | null = null;
  for (;;) {
    const result = await fetchPage(rows.length, rows.length + 499);
    if (result.error) throw new Error(result.error.message);
    if (result.count == null) throw new Error('تعذر التأكد من عدد النتائج. حاول مرة أخرى.');
    if (expected == null) expected = result.count;
    if (expected !== result.count) throw new Error('البيانات اتغيرت أثناء التحميل. حاول مرة أخرى.');
    const page = result.data ?? [];
    if (!page.length && rows.length < expected) throw new Error('لم يكتمل تحميل البيانات. حاول مرة أخرى.');
    rows.push(...page);
    if (rows.length === expected) return rows;
    if (rows.length > expected) throw new Error('البيانات اتغيرت أثناء التحميل. حاول مرة أخرى.');
  }
}
