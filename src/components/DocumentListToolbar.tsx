import { useRef, useState } from 'react';
import { Download } from 'lucide-react';
import PeriodFilter from './PeriodFilter';
import { toast } from './Toast';
import { errorMessage, translateDbError } from '../lib/errors';
import type { DocumentExportOptions } from '../lib/documentExcel';

interface DocumentListToolbarProps {
  options: DocumentExportOptions;
  onDatesChange: (from: string, to: string) => void;
  disabled?: boolean;
}
export default function DocumentListToolbar({ options, onDatesChange, disabled = false }: DocumentListToolbarProps) {
  const [exporting, setExporting] = useState(false);
  const busy = useRef(false);
  async function handleExport() {
    if (busy.current) return;
    busy.current = true;
    setExporting(true);
    try {
      const { exportDocumentExcel } = await import('../lib/documentExcel');
      await exportDocumentExcel(options);
    } catch (error) {
      toast.error(translateDbError(errorMessage(error)));
    } finally {
      busy.current = false;
      setExporting(false);
    }
  }
  return (
    <div className="erp-toolbar document-list-toolbar">
      <div className="erp-filters">
        <PeriodFilter from={options.dateFrom} to={options.dateTo} onChange={onDatesChange} />
      </div>
      <button type="button" className="btn outline document-export-btn" disabled={disabled || exporting}
        aria-busy={exporting} onClick={()=>void handleExport()}>
        <Download size={16} aria-hidden="true" />
        {exporting ? 'جارٍ التصدير…' : 'تصدير الجدول إلى إكسيل'}
      </button>
    </div>
  );
}
