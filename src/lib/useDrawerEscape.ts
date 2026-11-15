import { useEffect } from 'react';

/** إغلاق اللوحة الجانبية المفتوحة بمفتاح Escape ما لم تكن هناك نافذة منبثقة فوقها. */
export function useDrawerEscape(isOpen: boolean, onClose: () => void) {
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (document.querySelector('.modal-backdrop')) return;
      event.preventDefault();
      onClose();
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);
}
