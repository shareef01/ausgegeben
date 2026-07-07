import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageOff } from 'lucide-react';
import { LoadingGlassSpinner } from '@/components/ui';
import { IconDownload, IconShare } from '@/components/Icons';
import { receiptService } from '@/services/receiptService';
import { isCloudSyncActive } from '@/services/cloudSync';
import { useTranslation } from '@/i18n';
import { hapticLight, hapticSuccess } from '@/utils/haptics';
import { useToastStore } from '@/services/toastStore';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useSheetScrollLock } from '@/hooks/useSheetScrollLock';

const RECEIPT_LOAD_TIMEOUT_MS = 15_000;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('receipt-timeout')), ms);
    promise
      .then((value) => {
        window.clearTimeout(timer);
        resolve(value);
      })
      .catch((error: unknown) => {
        window.clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('receipt-load-failed'));
      });
  });
}

function useReceiptUrl(path: string) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    setUrl(null);
    setFailed(false);
    setLoading(true);
    void withTimeout(receiptService.getObjectUrl(path), RECEIPT_LOAD_TIMEOUT_MS).then((u) => {
      if (cancelled) return;
      setLoading(false);
      if (!u) {
        setFailed(true);
        return;
      }
      objectUrl = u;
      setUrl(u);
    }).catch(() => {
      if (!cancelled) {
        setLoading(false);
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path, attempt]);

  return { url, failed, loading, retry: () => setAttempt((a) => a + 1) };
}

interface ReceiptPreviewProps {
  path: string;
  onClose: () => void;
}

export function ReceiptPreview({ path, onClose }: ReceiptPreviewProps) {
  const { t } = useTranslation();
  const showToast = useToastStore((s) => s.show);
  const sheetRef = useRef<HTMLDivElement>(null);
  const { url, failed, loading, retry } = useReceiptUrl(path);
  const canShare = typeof navigator.share === 'function';

  const handleClose = useCallback(() => {
    hapticLight();
    onClose();
  }, [onClose]);

  useFocusTrap(true, sheetRef, handleClose);

  useSheetScrollLock();

  const handleShare = async () => {
    hapticLight();
    const ok = await receiptService.share(path);
    if (!ok) showToast(t('receiptLoadFailed'));
  };

  const handleDownload = async () => {
    hapticLight();
    const ok = await receiptService.download(path);
    if (ok) {
      hapticSuccess();
      showToast(t('snackbarReceiptSaved'));
    } else {
      showToast(t('receiptLoadFailed'));
    }
  };

  const handleRetry = () => {
    hapticLight();
    void receiptService.forceCloudRetry(path).finally(() => retry());
  };

  const sheet = (
    <div className="overlay overlay--receipt" onClick={handleClose} role="presentation">
      <div
        ref={sheetRef}
        className="sheet sheet--receipt"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby="receipt-preview-title"
      >
        <div className="sheet--receipt__handle" aria-hidden />
        <div className="sheet--receipt__header">
          <h2 id="receipt-preview-title" className="sheet--receipt__title">{t('receiptTitle')}</h2>
          <div className="sheet--receipt__actions">
            {url ? (
              <>
                {canShare ? (
                  <button
                    type="button"
                    className="add-sheet__icon-btn insights-glass-island"
                    onClick={() => void handleShare()}
                    aria-label={t('actionShare')}
                  >
                    <IconShare width={20} height={20} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className="add-sheet__icon-btn insights-glass-island"
                  onClick={() => void handleDownload()}
                  aria-label={t('actionDownload')}
                >
                  <IconDownload width={20} height={20} />
                </button>
              </>
            ) : null}
            <button type="button" className="sheet--settings__close" onClick={handleClose}>
              {t('actionClose')}
            </button>
          </div>
        </div>

        <div className="receipt-preview__frame insights-glass-island">
          {url ? (
            <img src={url} alt={t('receiptTitle')} className="receipt-preview__image" />
          ) : failed ? (
            <div className="receipt-preview__error-state">
              <ImageOff size={40} strokeWidth={1.5} aria-hidden />
              <p className="receipt-preview__error">{t('receiptLoadFailed')}</p>
              {isCloudSyncActive() ? (
                <p className="receipt-preview__error-hint">{t('receiptUnavailableOnDevice')}</p>
              ) : null}
              <button type="button" className="btn btn-secondary" onClick={handleRetry}>
                {t('receiptTryAgain')}
              </button>
            </div>
          ) : loading ? (
            <LoadingGlassSpinner label={t('loading')} />
          ) : null}
        </div>

        <button type="button" className="btn btn-secondary btn-block" onClick={handleClose}>
          {t('actionClose')}
        </button>
      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(sheet, document.body) : sheet;
}

interface ReceiptThumbnailProps {
  path: string;
  onClick: () => void;
}

export function ReceiptThumbnail({ path, onClick }: ReceiptThumbnailProps) {
  const { t } = useTranslation();
  const { url, failed, loading, retry } = useReceiptUrl(path);

  const handleClick = () => {
    if (failed) {
      hapticLight();
      void receiptService.forceCloudRetry(path).finally(() => retry());
      return;
    }
    if (url) onClick();
  };

  return (
    <button
      type="button"
      className={`receipt-thumbnail${loading ? ' receipt-thumbnail--loading' : ''}${failed ? ' receipt-thumbnail--error' : ''}`}
      onClick={handleClick}
      disabled={loading}
      aria-label={failed ? t('receiptTryAgain') : t('receiptTitle')}
      aria-busy={loading || undefined}
    >
      {url ? (
        <img src={url} alt="" className="receipt-thumbnail__image" />
      ) : failed ? (
        <span className="receipt-thumbnail__placeholder" aria-hidden>
          <ImageOff size={22} strokeWidth={1.5} />
        </span>
      ) : loading ? (
        <span className="receipt-thumbnail__placeholder" aria-hidden>
          <span className="receipt-preview__spinner receipt-preview__spinner--sm" />
        </span>
      ) : null}
    </button>
  );
}
