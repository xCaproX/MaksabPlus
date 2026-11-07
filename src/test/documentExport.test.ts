import { describe, expect, it, vi } from 'vitest';
import type { CellObject } from 'write-excel-file/browser';
import { collectAllRows } from '../lib/exportRows';
import { documentExcelData, type DocumentExportOptions } from '../lib/documentExcel';
import { documentListQuery } from '../lib/documentListQuery';
import { supabase } from '../lib/supabase';

vi.mock('../lib/supabase',()=>({supabase:{rpc:vi.fn()}}));
const options: DocumentExportOptions = {scope:'invoice',kind:'sale',filters:{},dateFrom:'2026-11-01',dateTo:'2026-11-06',
  sortOrder:'date-desc',showDeleted:false,title:'فواتير المبيعات',canViewProfit:false};
const row = { number:'SAL-000001', invoice_date:'2026-11-06',created_at:'2026-11-06T10:30:00Z',
  warehouse_id:'private-id',warehouse_name:'المخزن الرئيسي',account_kind:'customer',account_name:'=1+1',
  total:1234.5,paid:1000,remaining:234.5,notes:'=HYPERLINK("https://example.invalid")',profit_total:999,cost_total:888 };

describe('complete filtered document export',()=>{
  it('gets every row past server caps and page size, without duplicates',async()=>{
    const data=Array.from({length:1003},(_,id)=>({id}));
    const request=vi.fn(async(from:number,to:number)=>({data:data.slice(from,Math.min(to+1,from+173)),count:data.length,error:null}));
    expect(await collectAllRows(request)).toEqual(data);
    expect(request.mock.calls.map(args=>args[0])).toEqual([0,173,346,519,692,865]);
  });
  it('exports an empty result and refuses partial data or a failed later page',async()=>{
    expect(await collectAllRows(async()=>({data:[],count:0,error:null}))).toEqual([]);
    await expect(collectAllRows(async()=>({data:[],count:1,error:null}))).rejects.toThrow('لم يكتمل');
    let count=0;
    await expect(collectAllRows(async()=>++count===1?{data:[1],count:2,error:null}:{data:null,count:null,error:{message:'denied'}})).rejects.toThrow('denied');
  });
  it('refuses a changed or unknown total instead of silently saving a partial workbook',async()=>{
    let call=0;
    await expect(collectAllRows(async()=>({data:[1],count:++call===1?2:3,error:null}))).rejects.toThrow('اتغيرت');
    await expect(collectAllRows(async()=>({data:[],count:null,error:null}))).rejects.toThrow('عدد');
  });
  it('exports Arabic labels, real numeric/date cells, safe text, and only visible columns',()=>{
    const {data}=documentExcelData([row],options);
    const header=(data[0] as CellObject[]).map(c=>c.value);
    const cells=data[1] as CellObject[];
    expect(header).toEqual(['الرقم','التاريخ','الوقت','المخزن','نوع الحساب','الحساب','الإجمالي','المسدد','الآجل','الحالة','ملاحظات','بواسطة']);
    expect(cells[1]).toMatchObject({type:Date,format:'dd/mm/yyyy',value:new Date('2026-11-06T00:00:00Z')});
    expect(cells[2].value).toBe('12:30 PM');
    expect(cells[3].value).toBe('المخزن الرئيسي');
    expect(cells[4].value).toBe('عميل');
    expect(cells[5]).toMatchObject({type:String,value:'=1+1'});
    expect(cells[6]).toMatchObject({type:Number,value:1234.5,format:'#,##0.00'});
    expect(cells[9].value).toBe('جزئية');
    expect(cells[10]).toMatchObject({type:String,value:row.notes});
    expect(cells[11].value).toBe('غير مسجل');
    expect(JSON.stringify(data)).not.toContain('private-id');
    expect(header).not.toContain('الأرباح');
  });
  it('matches return/waste columns and permission-controlled transfer cost',()=>{
    const returned=documentExcelData([row],{...options,kind:'sale_return'}).data;
    expect((returned[0] as CellObject[]).map(c=>c.value)).toContain('غير المسترد');
    expect((returned[1] as CellObject[]).map(c=>c.value)).toContain('مستردة جزئيًا');
    const waste=documentExcelData([{...row,account_kind:'waste'}],{...options,kind:'waste'}).data;
    expect((waste[0] as CellObject[]).map(c=>c.value)).not.toContain('الآجل');
    expect((waste[1] as CellObject[]).map(c=>c.value)).toContain('هالك');
    const transfer={transfer_date:'2026-11-06',total_value:888,total_qty:2.25,line_count:1};
    for(const allowed of [false,true]){
      const data=documentExcelData([transfer],{...options,scope:'warehouse_transfer',canViewProfit:allowed}).data;
      expect((data[0] as CellObject[]).some(c=>c.value==='قيمة التكلفة')).toBe(allowed);
      expect((data[1] as CellObject[]).some(c=>c.value===888)).toBe(allowed);
    }
  });
  it('uses short receipt types, actual cash/account names and the statement fallback',()=>{
    const data=documentExcelData([{...row,cash_box_id:'cash-id',cash_box_name:'الخزنة الرئيسية',
      receipt_date:row.invoice_date,amount:100,is_free:true,statement:'استلام',created_by_name:'مستخدم'}],
      {...options,scope:'receipt',kind:'in'}).data[1] as CellObject[];
    expect(data.map(c=>c.value)).toContain('حر');
    expect(data.map(c=>c.value)).toContain('الخزنة الرئيسية');
    expect(data.map(c=>c.value)).toContain('استلام');
    expect(data.map(c=>c.value)).not.toContain('cash-id');
  });
});

describe('one query for visible rows and exports',()=>{
  it.each([
    ['invoice', 'sale', 'total-asc'],
    ['receipt', 'in', 'amount-asc'],
    ['receipt', 'out', 'account-asc'],
    ['warehouse_transfer', '', 'total-asc'],
    ['cash_transfer', '', 'amount-asc'],
  ] as const)('sends %s %s filters and pagination to the shared endpoint', async (scope, kind, sortOrder) => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { rows: [row], total_count: 1003 }, error: null } as never);
    const filters = { notes: 'بحث، (اختبار)', created_by_name: 'مستخدم' };
    const result = await documentListQuery({ ...options, scope, kind, filters, sortOrder, showDeleted: true }).range(500, 999);
    expect(supabase.rpc).toHaveBeenLastCalledWith('get_document_page', {
      p_scope: scope, p_columns: filters, p_kind: kind, p_search: null,
      p_date_from: options.dateFrom, p_date_to: options.dateTo,
      p_show_deleted: true, p_sort_order: sortOrder, p_offset: 500, p_limit: 500,
    });
    expect(result).toEqual({ data: [row], count: 1003, error: null });
  });
  it('preserves invoice totals on an empty later page and propagates database errors',async()=>{
    vi.mocked(supabase.rpc).mockResolvedValueOnce({data:{rows:[],total_count:25},error:null} as never);
    expect(await documentListQuery(options).range(40,59)).toEqual({data:[],count:25,error:null});
    vi.mocked(supabase.rpc).mockResolvedValueOnce({data:null,error:{message:'permission_denied'}} as never);
    expect(await documentListQuery(options).range(0,19)).toEqual({data:null,count:null,error:{message:'permission_denied'}});
  });
  it('uses the invoice page contract for a complete export beyond the visible page',async()=>{
    const rows=Array.from({length:1003},(_,id)=>({id}));
    vi.mocked(supabase.rpc).mockImplementation((_name,args)=>{
      const parameters=args as {p_offset:number;p_limit:number};
      return Promise.resolve({data:{rows:rows.slice(parameters.p_offset,parameters.p_offset+parameters.p_limit),total_count:1003},error:null}) as never;
    });
    expect(await collectAllRows((from,to)=>documentListQuery(options).range(from,to))).toEqual(rows);
    expect(vi.mocked(supabase.rpc).mock.calls.slice(-3).map(call=>call[1]?.p_offset)).toEqual([0,500,1000]);
  });
  it('sends null dates for an unbounded period', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { rows: [], total_count: 0 }, error: null } as never);
    await documentListQuery({ ...options, dateFrom: '', dateTo: '' }).range(0, 19);
    expect(supabase.rpc).toHaveBeenLastCalledWith('get_document_page', expect.objectContaining({
      p_date_from: null, p_date_to: null, p_sort_order: 'date-desc', p_show_deleted: false,
    }));
  });
});
