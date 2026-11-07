import type { ReactNode } from 'react';
import KpiBar, { type KpiItem } from './KpiBar';
import DocumentListToolbar from './DocumentListToolbar';
import Pagination from './Pagination';
import ConfirmDialog from './ConfirmDialog';
import Modal from './Modal';
import MasterDataGate from './MasterDataGate';
import type { MasterDataResource, MasterDataContextType } from '../context/MasterDataContext';

export interface DocumentListTabItem<TValue extends string = string> {
  value: TValue;
  label: string;
}

export interface DocumentListConfirmState {
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface DocumentListPageProps<TTab extends string = string> {
  title: string;
  subtitle?: string;
  deletedWarning?: string;

  tabs: readonly DocumentListTabItem<TTab>[];
  activeTab: TTab;
  onTabChange: (tab: TTab) => void;

  kpiItems: KpiItem[];
  kpiAriaLabel?: string;

  toolbarScope: 'invoice' | 'receipt' | 'warehouse_transfer' | 'cash_transfer';
  toolbarKind?: string;
  toolbarFilters: Record<string, string>;
  canViewProfit?: boolean;
  dateFrom: string;
  dateTo: string;
  onDatesChange: (from: string, to: string) => void;
  showDeleted: boolean;
  onDeletedToggle?: () => void;
  canDelete?: boolean;
  canCreate?: boolean;
  sortOrder: string;
  newLabel?: string;
  onNew?: () => void;
  toolbarDisabled?: boolean;

  children: ReactNode;
  page: number;
  totalCount: number;
  pageSize?: number;
  onPageChange: (page: number) => void;

  modalOpen: boolean;
  modalTitle?: string;
  modalClassName?: string;
  modalBackdropClassName?: string;
  modalDismissible?: boolean;
  modalOnClose: () => void;
  modalResources?: readonly MasterDataResource[];
  modalResourceStatus?: MasterDataContextType['resourceStatus'];
  modalGateKey?: string;
  renderModalContent?: () => ReactNode;

  confirmation?: DocumentListConfirmState | null;
}

export default function DocumentListPage<TTab extends string = string>({
  title,
  subtitle,
  deletedWarning,
  tabs,
  activeTab,
  onTabChange,
  kpiItems,
  kpiAriaLabel,
  toolbarScope,
  toolbarKind,
  toolbarFilters,
  canViewProfit = false,
  dateFrom,
  dateTo,
  onDatesChange,
  showDeleted,
  onDeletedToggle,
  canDelete = true,
  canCreate = true,
  sortOrder,
  newLabel,
  onNew,
  toolbarDisabled,
  children,
  page,
  totalCount,
  pageSize = 20,
  onPageChange,
  modalOpen,
  modalTitle,
  modalClassName,
  modalBackdropClassName,
  modalDismissible = true,
  modalOnClose,
  modalResources,
  modalResourceStatus,
  modalGateKey,
  renderModalContent,
  confirmation,
}: DocumentListPageProps<TTab>) {
  const pageCount = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <div className="stack">
      <div className="page-head">
        <div>
          <h1>{showDeleted ? `المحذوفات — ${title}` : title}</h1>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        <div className="actions">
          {canDelete && onDeletedToggle && (
            <button type="button" className="btn outline" onClick={onDeletedToggle}>
              {showDeleted ? 'عرض النشط' : 'عرض المحذوفات'}
            </button>
          )}
          {!showDeleted && canCreate && onNew && (
            <button type="button" className="btn primary" onClick={onNew}>
              {newLabel}
            </button>
          )}
        </div>
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <button
            key={tab.value}
            type="button"
            className={`tab ${activeTab === tab.value ? 'active' : ''}`}
            onClick={() => onTabChange(tab.value)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {showDeleted && deletedWarning && (
        <p className="hint warning">{deletedWarning}</p>
      )}

      {/* شريط المؤشرات والإجماليات المتفاعل مع الفلاتر */}
      <KpiBar items={kpiItems} ariaLabel={kpiAriaLabel ?? `مؤشرات ${title}`} />

      {/* شريط الأدوات الموحد */}
      <DocumentListToolbar
        options={{
          scope: toolbarScope,
          kind: toolbarKind ?? '',
          filters: toolbarFilters,
          dateFrom,
          dateTo,
          showDeleted,
          sortOrder,
          title: showDeleted ? `المحذوفات — ${title}` : title,
          canViewProfit,
        }}
        disabled={toolbarDisabled}
        onDatesChange={onDatesChange}
      />

      {/* مساحة عرض الجدول والترقيم */}
      <div className="erp-sales-workspace">
        <section className="erp-list-panel" aria-label={`قائمة ${title}`}>
          {children}

          <Pagination
            page={page}
            pageCount={pageCount}
            totalCount={totalCount}
            pageSize={pageSize}
            onPageChange={onPageChange}
          />
        </section>
      </div>

      {/* نافذة التأكيد الموحدة */}
      {confirmation && <ConfirmDialog {...confirmation} />}

      {/* نافذة إنشاء وعرض وتعديل المستند الموحدة */}
      {modalOpen && (
        <Modal
          title={modalTitle ?? ''}
          className={modalClassName}
          backdropClassName={modalBackdropClassName}
          dismissible={modalDismissible}
          onClose={modalOnClose}
        >
          {modalResources && modalResources.length > 0 && modalResourceStatus ? (
            <MasterDataGate
              key={modalGateKey}
              resources={modalResources}
              status={modalResourceStatus}
            >
              {renderModalContent ? renderModalContent() : null}
            </MasterDataGate>
          ) : (
            renderModalContent ? renderModalContent() : null
          )}
        </Modal>
      )}
    </div>
  );
}
