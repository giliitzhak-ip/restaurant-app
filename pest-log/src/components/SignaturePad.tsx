import { useCallback, useEffect, useRef, useState } from 'react';
import { fieldDomId } from '@/schema/fieldRegistry';
import { serverNowIso } from '@/lib/time';
import type { SignatureValue } from '@/schema/primitives';

/**
 * לוח חתימה מבוסס canvas, מותאם למגע.
 *
 * - Pointer Events: עובד באצבע, בעט ובעכבר.
 * - `touch-action: none` מונע גלילה תוך כדי חתימה.
 * - ניקוי ואישור מפורש: החתימה נשמרת ליומן רק אחרי שהחותם לחץ "אישור".
 * - ה-canvas מתוחזק ב-devicePixelRatio כדי שהקו יהיה חד בנייד.
 */

export interface SignaturePadProps {
  path: string;
  label: string;
  signerName: string;
  onSignerNameChange?: (name: string) => void;
  value: Partial<SignatureValue> | undefined;
  onChange: (value: Partial<SignatureValue> | undefined) => void;
  error?: string | undefined;
  disabled?: boolean;
  /** כאשר השם מגיע משדה אחר ואינו ניתן לעריכה כאן. */
  lockName?: boolean;
}

export function SignaturePad({
  path,
  label,
  signerName,
  onSignerNameChange,
  value,
  onChange,
  error,
  disabled = false,
  lockName = false,
}: SignaturePadProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const strokesRef = useRef(0);
  const [hasInk, setHasInk] = useState(Boolean(value?.dataUrl ?? value?.storagePath));
  const confirmed = value?.confirmed === true;

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = globalThis.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0) return;
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);
    const context = canvas.getContext('2d');
    if (!context) return;
    context.scale(ratio, ratio);
    context.lineWidth = 2.2;
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.strokeStyle = '#111';
    // רקע לבן אטום — כדי שה-PNG ייראה נכון גם על רקע כהה ב-PDF.
    context.fillStyle = '#f7f7f2';
    context.fillRect(0, 0, rect.width, rect.height);

    // שחזור חתימה קיימת (חזרה לשלב, רענון דף).
    if (value?.dataUrl) {
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value.dataUrl;
      setHasInk(true);
    }
  }, [value?.dataUrl]);

  useEffect(() => {
    setupCanvas();
    const handleResize = () => setupCanvas();
    globalThis.addEventListener('resize', handleResize);

    // ה-canvas עשוי להיכנס לתצוגה אחרי הרינדור הראשון (מעבר שלב), ואז
    // רוחבו היה 0 בהגדרה הראשונה. ResizeObserver מגדיר אותו מחדש.
    const canvas = canvasRef.current;
    const observer =
      typeof ResizeObserver === 'function' && canvas
        ? new ResizeObserver(() => setupCanvas())
        : null;
    if (observer && canvas) observer.observe(canvas);

    return () => {
      globalThis.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pointFromEvent = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const startStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (disabled || confirmed) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;

    // הסימון נעשה לפני setPointerCapture: יש דפדפנים שבהם הקריאה זורקת
    // (למשל כשהמצביע אינו פעיל), ואז הציור לא היה מתחיל בכלל.
    drawingRef.current = true;
    strokesRef.current += 1;
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      // לא קריטי: בלי capture הציור ממשיך לעבוד כל עוד המצביע על ה-canvas.
    }

    const { x, y } = pointFromEvent(event);
    context.beginPath();
    context.moveTo(x, y);
    // נקודה בודדת נחשבת חתימה: לחיצה בלי גרירה משאירה סימן.
    context.lineTo(x, y);
    context.stroke();
    setHasInk(true);
  };

  const continueStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || disabled || confirmed) return;
    const context = canvasRef.current?.getContext('2d');
    if (!context) return;
    const { x, y } = pointFromEvent(event);
    context.lineTo(x, y);
    context.stroke();
    if (!hasInk) setHasInk(true);
  };

  const endStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      canvasRef.current?.releasePointerCapture(event.pointerId);
    } catch {
      // המצביע כבר שוחרר.
    }
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    context.fillStyle = '#f7f7f2';
    context.fillRect(0, 0, rect.width, rect.height);
    strokesRef.current = 0;
    setHasInk(false);
    onChange(undefined);
  };

  const confirm = () => {
    const canvas = canvasRef.current;
    if (!canvas || !hasInk) return;
    onChange({
      dataUrl: canvas.toDataURL('image/png'),
      signedAt: serverNowIso(),
      signerName,
      confirmed: true,
    });
  };

  const unlock = () => {
    // ביטול האישור מחזיר את הלוח לעריכה, בלי למחוק את הציור.
    onChange(value ? { ...value, confirmed: undefined as unknown as true } : undefined);
  };

  const nameId = `${fieldDomId(path)}-name`;

  return (
    <div className={`field${error ? ' has-error' : ''}`} id={fieldDomId(path)}>
      <span className="field-label">{label}</span>

      <div className="field">
        <label htmlFor={nameId}>שם החותם</label>
        <input
          id={nameId}
          type="text"
          value={signerName}
          disabled={disabled || lockName || confirmed}
          onChange={(event) => onSignerNameChange?.(event.target.value)}
          aria-required="true"
        />
        {lockName ? <div className="hint">השם נלקח משדה "שם האדם שקיבל את היומן".</div> : null}
      </div>

      <canvas
        ref={canvasRef}
        className={`signature-pad${confirmed ? ' confirmed' : ''}`}
        role="img"
        aria-label={`אזור חתימה עבור ${label}`}
        onPointerDown={startStroke}
        onPointerMove={continueStroke}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
        onPointerLeave={endStroke}
      />

      <div className="signature-meta">
        <span className="small dim">
          {confirmed
            ? `החתימה אושרה${value?.signedAt ? ` · ${new Date(value.signedAt).toLocaleString('he-IL')}` : ''}`
            : hasInk
              ? 'יש ללחוץ על "אישור החתימה" כדי לשמור אותה ביומן.'
              : 'חתמו באצבע או בעט באזור שלמעלה.'}
        </span>
        <div className="btn-row">
          <button type="button" className="btn btn-sm" onClick={clear} disabled={disabled || (!hasInk && !confirmed)}>
            ניקוי
          </button>
          {confirmed ? (
            <button type="button" className="btn btn-sm" onClick={unlock} disabled={disabled}>
              עריכה מחדש
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={confirm}
              disabled={disabled || !hasInk || signerName.trim().length === 0}
            >
              אישור החתימה
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="field-error" role="alert">
          {error}
        </div>
      ) : null}
    </div>
  );
}
