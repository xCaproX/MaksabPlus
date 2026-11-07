import { useCallback, useState } from 'react';

export interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  /** true = عملية خطيرة (حذف/إيقاف) → زر تأكيد ورمز أحمر داخل النافذة */
  danger?: boolean;
  resolve: (confirmed: boolean) => void;
}

export interface ConfirmationOptions {
  title?: string;
  danger?: boolean;
}

/**
 * خطاف مخصص (Hook) لإدارة نوافذ تأكيد العمليات الحساسة (الحذف، الإلغاء، الاسترجاع)
 * يحقق مبدأ المسؤولية الواحدة (SRP) ومبدأ عدم التكرار (DRY).
 * الإشارة إلى الخطر (danger) بيانات صريحة من المُنادي، وليست استنتاجاً من نص الزر.
 */
export function useConfirmDialog() {
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const askConfirmation = useCallback(
    (message: string, confirmLabel = 'تأكيد', options: ConfirmationOptions = {}): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmation({
          title: options.title ?? 'تأكيد العملية',
          message,
          confirmLabel,
          danger: options.danger ?? false,
          resolve,
        });
      });
    },
    [],
  );

  const finishConfirmation = useCallback(
    (confirmed: boolean) => {
      const pendingRequest = confirmation;
      setConfirmation(null);
      pendingRequest?.resolve(confirmed);
    },
    [confirmation],
  );

  return {
    confirmation,
    askConfirmation,
    finishConfirmation,
  };
}
