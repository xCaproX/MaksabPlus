import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { CellObject } from 'write-excel-file/browser';
import { collectExportRows } from '../lib/exportRows';
import { documentExcelData, type DocumentExportOptions } from '../lib/documentExcel';
import { documentListQuery, type DocumentScope } from '../lib/documentListQuery';
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
    expect(await collectExportRows(request)).toEqual(data);
    expect(request.mock.calls.map(args=>args[0])).toEqual([0,173,346,519,692,865]);
  });
  it('exports an empty result and refuses partial data or a failed later page',async()=>{
    expect(await collectExportRows(async()=>({data:[],count:0,error:null}))).toEqual([]);
    await expect(collectExportRows(async()=>({data:[],count:1,error:null}))).rejects.toThrow('لم يكتمل');
    let count=0;
    await expect(collectExportRows(async()=>++count===1?{data:[1],count:2,error:null}:{data:null,count:null,error:{message:'denied'}})).rejects.toThrow('denied');
  });
  it('refuses a changed or unknown total instead of silently saving a partial workbook',async()=>{
    let call=0;
    await expect(collectExportRows(async()=>({data:[1],count:++call===1?2:3,error:null}))).rejects.toThrow('اتغيرت');
    await expect(collectExportRows(async()=>({data:[],count:null,error:null}))).rejects.toThrow('عدد');
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
  const calls: unknown[][]=[];
  beforeEach(()=>{calls.length=0;vi.mocked(supabase.rpc).mockImplementation((name,args,opts)=>{
    calls.push(['rpc',name,args,opts]);
    const query=Object.fromEntries(['select','eq','not','is','gte','lte','order','range'].map(method=>[method,(...args:unknown[])=>{calls.push([method,...args]);return query;}]));
    return query as never;
  });});
  it.each([
    ['invoice','filter_invoice_rows','invoice_date','total'],
    ['receipt','filter_receipt_rows','receipt_date','amount'],
    ['warehouse_transfer','filter_warehouse_transfer_rows','transfer_date','total_value'],
    ['cash_transfer','filter_cash_transfer_rows','transfer_date','amount'],
  ] as const)('retains the filters, deleted state, dates and sort for %s',(scope,rpc,date,amount)=>{
    const filters={account:'اسم، (عميل)',created_by_name:'مستخدم'};
    documentListQuery({...options,scope,filters,sortOrder:scope==='invoice'||scope==='warehouse_transfer'?'total-asc':'amount-asc',showDeleted:true}).range(500,999);
    expect(calls[0]).toEqual(['rpc',rpc,{p_columns:filters,p_search:null,...(['invoice','receipt'].includes(scope)?{p_kind:'sale'}:{})},{count:'exact'}]);
    expect(calls).toContainEqual(['not','deleted_at','is',null]);
    expect(calls).toContainEqual(['gte',date,options.dateFrom]);
    expect(calls).toContainEqual(['lte',date,options.dateTo]);
    expect(calls).toContainEqual(['order',amount,{ascending:true}]);
    expect(calls).toContainEqual(['order','number',{ascending:true}]);
    expect(calls[calls.length-1]).toEqual(['range',500,999]);
  });
  it.each(['invoice','receipt','warehouse_transfer','cash_transfer'] as DocumentScope[])('retains descending default and unbounded period for %s',(scope)=>{
    documentListQuery({...options,scope,dateFrom:'',dateTo:''});
    expect(calls.some(c=>c[0]==='gte'||c[0]==='lte')).toBe(false);
    expect(calls).toContainEqual(['is','deleted_at',null]);
    expect(calls.filter(c=>c[0]==='order').every(c=>(c[2] as {ascending:boolean}).ascending===false)).toBe(true);
  });
  it.each(['warehouse_transfer','cash_transfer'] as DocumentScope[])('keeps the established descending date fallback for unsupported party sorting on %s',(scope)=>{
    documentListQuery({...options,scope,sortOrder:'account-asc'});
    expect(calls).toContainEqual(['order','transfer_date',{ascending:false}]);
  });
});
