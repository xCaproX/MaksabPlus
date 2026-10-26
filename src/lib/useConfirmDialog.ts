import { useCallback, useState } from 'react';

export interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

/**
 * خطاف مخصص (Hook) لإدارة نوافذ تأكيد العمليات الحساسة (الحذف، الإلغاء، الاسترجاع)
 * يحقق مبدأ المسؤولية الواحدة (SRP) ومبدأ عدم التكرار (DRY).
 */
export function useConfirmDialog() {
  const [confirmation, setConfirmation] = useState<ConfirmationRequest | null>(null);

  const askConfirmation = useCallback(
    (message: string, confirmLabel = 'تأكيد', title = 'تأكيد العملية'): Promise<boolean> => {
      return new Promise((resolve) => {
        setConfirmation({ title, message, confirmLabel, resolve });
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
