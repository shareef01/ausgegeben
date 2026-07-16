import { useEffect, useState, useRef, useCallback, useId } from 'react';
import { receiptService } from '@/services/receiptService';
import { useTranslation } from '@/i18n';
import { IconClose } from '@/components/Icons';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBodyScrollLock } from '@/hooks/useBodyScrollLock';

interface ReceiptPreviewProps {
  path: string;
  onClose: () => void;
}

export function ReceiptPreview({ path, onClose }: ReceiptPreviewProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const loadSeq = useRef(0);
  const sheetRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const close = useCallback(() => onClose(), [onClose]);
  useFocusTrap(true, sheetRef, close);
  useBodyScrollLock(true);

  useEffect(() => {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    let objectUrl: string | null = null;

    setLoading(true);
    setUrl(null);

    void receiptService.getObjectUrl(path).then((u) => {
      if (seq !== loadSeq.current) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
      setLoading(false);
    });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return (
    <div className="overlay" onClick={close} role="presentation">
      <div
        ref={sheetRef}
        className="sheet receipt-preview"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
      >
        <div className="receipt-preview__header">
          <h2 id={titleId} className="receipt-preview__title">{t('receiptTitle')}</h2>
          <button type="button" className="receipt-preview__close" onClick={close} aria-label={t('actionClose')}>
            <IconClose width={20} height={20} />
          </button>
        </div>
        <div className="receipt-preview__body">
          {loading ? (
            <div className="receipt-preview__skeleton" aria-busy="true" />
          ) : url ? (
            <img src={url} alt={t('receiptTitle')} className="receipt-preview__image" />
          ) : (
            <p className="receipt-preview__error">{t('errorLoadFailed')}</p>
          )}
        </div>
        <p className="receipt-preview__device-hint">{t('receiptUnavailableElsewhere')}</p>
      </div>
    </div>
  );
}

interface ReceiptThumbnailProps {
  path: string;
  onClick: () => void;
}

export function ReceiptThumbnail({ path, onClick }: ReceiptThumbnailProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);
  const loadSeq = useRef(0);

  useEffect(() => {
    loadSeq.current += 1;
    const seq = loadSeq.current;
    let objectUrl: string | null = null;

    void receiptService.getObjectUrl(path).then((u) => {
      if (seq !== loadSeq.current) {
        if (u) URL.revokeObjectURL(u);
        return;
      }
      objectUrl = u;
      setUrl(u);
    });

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return (
    <button
      type="button"
      onClick={onClick}
      className="receipt-thumbnail"
      aria-label={t('recordViewReceipt')}
    >
      {url ? (
        <img src={url} alt="" className="receipt-thumbnail__image" />
      ) : (
        <div className="receipt-thumbnail__skeleton" aria-busy="true" />
      )}
    </button>
  );
}
