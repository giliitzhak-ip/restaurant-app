import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useApp } from '@/state/AppContext';
import { useDraft } from '@/state/useDraft';
import { Alert, focusField, PoisonNotice, ProblemList, SyncBadge } from '@/components/Common';
import { WIZARD_STEPS, type WizardStepIndex } from '@/schema/fieldRegistry';
import { validateForCompletion, type ValidationProblem } from '@/schema/pestLog';
import { serverNow } from '@/lib/time';
import { idempotencyKey } from '@/lib/ids';
import { completeLog, isApiError } from '@/lib/api';
import { Step1Parties } from './Step1Parties';
import { Step2Location } from './Step2Location';
import { Step3Monitoring } from './Step3Monitoring';
import { Step4Treatment } from './Step4Treatment';
import { Step5Warnings } from './Step5Warnings';
import { Step6Handover } from './Step6Handover';

/**
 * אשף מילוי היומן — שישה שלבים.
 * השמירה אוטומטית בכל שינוי, מצב הסנכרון מוצג תמיד, וההשלמה חסומה
 * כל עוד חסר מידע מחייב.
 */
export function WizardPage(): React.JSX.Element {
  const { logId } = useParams<{ logId: string }>();
  const navigate = useNavigate();
  const { profile, syncEngine, syncStatus, reference } = useApp();
  const draft = useDraft(logId ?? '', profile?.organizationId ?? null, syncEngine);

  const [step, setStep] = useState<WizardStepIndex>(1);
  const [problems, setProblems] = useState<ValidationProblem[]>([]);
  const [validated, setValidated] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completionError, setCompletionError] = useState<string | null>(null);

  const errors = useMemo(() => {
    const map = new Map<string, string>();
    for (const problem of problems) {
      if (!map.has(problem.path)) map.set(problem.path, problem.message);
    }
    return map;
  }, [problems]);

  const problemsByStep = useMemo(() => {
    const counts = new Map<WizardStepIndex, number>();
    for (const problem of problems) counts.set(problem.step, (counts.get(problem.step) ?? 0) + 1);
    return counts;
  }, [problems]);

  const runValidation = useCallback((): ValidationProblem[] => {
    const result = validateForCompletion(draft.content, { serverNow: serverNow() });
    const next = result.ok ? [] : result.problems;
    setProblems(next);
    setValidated(true);
    return next;
  }, [draft.content]);

  const goToProblem = useCallback((problem: ValidationProblem) => {
    setStep(problem.step);
    // ממתינים לרינדור השלב לפני מיקוד השדה.
    requestAnimationFrame(() => requestAnimationFrame(() => focusField(problem.path)));
  }, []);

  const handleComplete = useCallback(async () => {
    setCompletionError(null);
    const found = runValidation();
    if (found.length > 0) {
      const first = found[0];
      if (first) goToProblem(first);
      return;
    }

    setCompleting(true);
    try {
      // מוודאים שהטיוטה העדכנית נשמרה לפני ההשלמה.
      await draft.flushNow();

      const key = idempotencyKey('complete_log', logId ?? '', String(draft.content['__completionNonce'] ?? 'v1'));
      const result = await completeLog(logId ?? '', draft.content, key);

      if (isApiError(result)) {
        if (result.code === 'validation' && result.problems) {
          setProblems(result.problems);
          const first = result.problems[0];
          if (first) goToProblem(first);
        }
        setCompletionError(result.message);
        return;
      }

      navigate(`/logs/${logId}/completed`, {
        state: {
          serialNumber: result.serialNumber,
          documentHash: result.documentHash,
          signedUrl: result.signedUrl,
        },
      });
    } finally {
      setCompleting(false);
    }
  }, [draft, goToProblem, logId, navigate, runValidation]);

  if (draft.loading) {
    return (
      <div className="card">
        <p className="muted">טוען את היומן…</p>
      </div>
    );
  }

  if (draft.readOnly || draft.status === 'completed') {
    return (
      <>
        <PoisonNotice />
        <Alert kind="info" title={`יומן מספר ${draft.serialNumber ?? ''} הושלם`}>
          יומן שהושלם אינו ניתן לעריכה. לתיקון יש להפיק גרסת תיקון מקושרת מתוך הארכיון.
        </Alert>
        <button type="button" className="btn" onClick={() => navigate('/archive')}>
          חזרה לארכיון
        </button>
      </>
    );
  }

  const stepProps = { draft, reference, errors };

  return (
    <>
      <PoisonNotice />

      <nav className="stepper" aria-label="שלבי מילוי היומן">
        {WIZARD_STEPS.map((definition) => {
          const count = problemsByStep.get(definition.index as WizardStepIndex) ?? 0;
          const isCurrent = definition.index === step;
          return (
            <button
              key={definition.index}
              type="button"
              className={`step-chip${count > 0 ? ' has-errors' : validated ? ' complete' : ''}`}
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => setStep(definition.index as WizardStepIndex)}
            >
              <span className="step-num" aria-hidden="true">
                {definition.index}
              </span>
              <span>{definition.title}</span>
              {count > 0 ? <span className="visually-hidden">{` — ${count} שגיאות`}</span> : null}
            </button>
          );
        })}
      </nav>

      {completionError ? (
        <Alert kind="error" title="ההשלמה לא הושלמה">
          {completionError}
        </Alert>
      ) : null}

      {draft.syncState === 'error' && draft.lastError ? (
        <Alert kind="error" title="שגיאת סנכרון">
          {draft.lastError}
          <div className="btn-row" style={{ marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-sm" onClick={() => void syncEngine.retryFailed()}>
              ניסיון סנכרון חוזר
            </button>
          </div>
        </Alert>
      ) : null}

      <ProblemList problems={problems} onNavigate={goToProblem} />

      <main id="wizard-step" aria-live="polite">
        {step === 1 ? <Step1Parties {...stepProps} /> : null}
        {step === 2 ? <Step2Location {...stepProps} /> : null}
        {step === 3 ? <Step3Monitoring {...stepProps} /> : null}
        {step === 4 ? <Step4Treatment {...stepProps} /> : null}
        {step === 5 ? <Step5Warnings {...stepProps} /> : null}
        {step === 6 ? <Step6Handover {...stepProps} /> : null}
      </main>

      <div className="wizard-footer">
        <button
          type="button"
          className="btn"
          disabled={step === 1}
          onClick={() => setStep((current) => Math.max(1, current - 1) as WizardStepIndex)}
        >
          הקודם
        </button>

        <div className="spacer" style={{ textAlign: 'center' }}>
          <SyncBadge
            state={draft.syncState}
            pendingCount={syncStatus.pendingCount}
            isOnline={syncStatus.isOnline}
          />
        </div>

        {step < 6 ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setStep((current) => Math.min(6, current + 1) as WizardStepIndex)}
          >
            הבא
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={() => void handleComplete()} disabled={completing}>
            {completing ? 'משלים…' : 'השלמת היומן'}
          </button>
        )}
      </div>
    </>
  );
}
