import { useEffect, useState, useCallback } from 'react';
import { receiptService } from '@/services/receiptService';
import { useTranslation } from '@/i18n';

interface ReceiptPreviewProps {
  path: string;
  onClose: () => void;
}

export function ReceiptPreview({ path, onClose }: ReceiptPreviewProps) {
  const { t } = useTranslation();
  const [url, setUrl] = useState<string | null>(null);

  const handleClose = useCallback(onClose, [onClose]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [handleClose]);

  useEffect(() => {
    let objectUrl: string | null = null;
    void receiptService.getObjectUrl(path).then((u) => {
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="sheet receipt-preview" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{t('receiptTitle')}</h2>
          <button type="button" onClick={handleClose} aria-label={t('actionClose')}>{t('actionClose')}</button>
        </div>
        {url ? (
          <img src={url} alt={t('receiptTitle')} style={{ width: '100%', borderRadius: 12, maxHeight: '70vh', objectFit: 'contain' }} />
        ) : (
          <p>{t('loading')}</p>
        )}
      </div>
    </div>
  );
}

interface ReceiptThumbnailProps {
  path: string;
  onClick: () => void;
}

export function ReceiptThumbnail({ path, onClick }: ReceiptThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    void receiptService.getObjectUrl(path).then((u) => {
      objectUrl = u;
      setUrl(u);
    });
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  if (!url) return null;

  return (
    <button type="button" onClick={onClick} style={{ padding: 0, border: 'none', borderRadius: 8, overflow: 'hidden' }}>
      <img src={url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', display: 'block' }} />
    </button>
  );
}
