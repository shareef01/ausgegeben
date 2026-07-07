import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera } from 'lucide-react';
import { IconArrowLeft } from '@/components/Icons';
import { LoadingGlassSpinner } from '@/components/ui';
import { useTranslation } from '@/i18n';
import { hapticLight, hapticMedium } from '@/utils/haptics';
import { useFocusTrap } from '@/hooks/useFocusTrap';

interface CameraScreenProps {
  onCaptured: (file: File) => void;
  onClose: () => void;
}

export function CameraScreen({ onCaptured, onClose }: CameraScreenProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(true);
  const [retryKey, setRetryKey] = useState(0);

  const handleClose = useCallback(() => {
    hapticLight();
    onClose();
  }, [onClose]);

  useFocusTrap(true, rootRef, handleClose);

  const startCamera = useCallback(async () => {
    setError(null);
    setStarting(true);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;

    if (!navigator.mediaDevices?.getUserMedia) {
      setError(t('cameraStartFailed'));
      setStarting(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
    } catch {
      setError(t('cameraStartFailed'));
    } finally {
      setStarting(false);
    }
  }, [t]);

  useEffect(() => {
    void startCamera();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [startCamera, retryKey]);

  const capture = () => {
    hapticMedium();
    const video = videoRef.current;
    if (!video || !video.videoWidth) {
      setError(t('cameraCaptureFailed'));
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      setError(t('cameraCaptureFailed'));
      return;
    }
    ctx.drawImage(video, 0, 0);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError(t('cameraCaptureFailed'));
          return;
        }
        onCaptured(new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <div ref={rootRef} className="camera-screen" role="dialog" aria-modal="true" aria-label={t('cameraCapture')} tabIndex={-1}>
      <video ref={videoRef} className="camera-screen__video" playsInline muted />

      <button
        type="button"
        className="camera-screen__back add-sheet__icon-btn insights-glass-island"
        onClick={() => { handleClose(); }}
        aria-label={t('actionBack')}
      >
        <IconArrowLeft width={20} height={20} aria-hidden />
      </button>

      {starting && !error ? (
        <div className="camera-screen__loading" role="status" aria-live="polite">
          <LoadingGlassSpinner label={t('loading')} />
        </div>
      ) : null}

      {error ? (
        <div className="camera-screen__error insights-glass-island" role="alert">
          <div className="camera-screen__error-icon" aria-hidden>
            <AlertCircle size={28} />
          </div>
          <p className="camera-screen__error-text">{error}</p>
          <div className="camera-screen__error-actions">
            <button type="button" className="btn btn-secondary" onClick={handleClose}>
              {t('cameraGoBack')}
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setRetryKey((k) => k + 1)}>
              {t('cameraTryAgain')}
            </button>
          </div>
        </div>
      ) : !starting ? (
        <div className="camera-screen__controls">
          <button type="button" className="camera-screen__shutter" onClick={capture} aria-label={t('cameraCapture')}>
            <span className="camera-screen__shutter-disc" aria-hidden>
              <Camera size={26} />
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function canUseCamera(): boolean {
  return typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}
