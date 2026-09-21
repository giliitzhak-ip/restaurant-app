import { useEffect, useRef, useState } from 'react';
import { navigate } from '../../router';
import { useStore } from '../../state/store';
import { Card, EmptyState, SaveIndicator } from '../../components/ui';
import { journalNumberText } from '../../lib/format';
import { Step1Work } from './Step1Work';
import { Step2Customer } from './Step2Customer';
import { Step3Findings } from './Step3Findings';
import { Step4Treatment } from './Step4Treatment';
import { Step5Materials } from './Step5Materials';
import { Step6Instructions } from './Step6Instructions';
import { Step7Summary } from './Step7Summary';
import { Step8Signatures } from './Step8Signatures';

export const STEPS = [
  'פרטי העבודה',
  'לקוח ואתר',
  'ניטור וממצאים',
  'החלטה על טיפול',
  'תכשירים וחומרים',
  'הנחיות ואזהרות',
  'סיכום ואחריות',
  'חתימות וסיום',
];

export function JournalWizard({ journalId, step }: { journalId?: string; step: number }) {
  const { state, updateJournal, saveState, pendingSync, online } = useStore();
  const journal = state.journals.find((j) => j.id === journalId);
  const [direction, setDirection] = useState<'fwd' | 'back'>('fwd');
  const lastStep = useRef(step);
  const tabsRef = useRef<HTMLDivElement>(null);

  const current = Math.min(Math.max(step || 1, 1), STEPS.length);

  useEffect(() => {
    setDirection(step >= lastStep.current ? 'fwd' : 'back');
    lastStep.current = step;
  }, [step]);

  useEffect(() => {
    if (journal && journal.lastStep !== current) updateJournal(journal.id, { lastStep: current });
  }, [journal, current, updateJournal]);

  /** מביא את לשונית השלב הנוכחי לתצוגה, כדי שתמיד יהיה ברור היכן נמצאים. */
  useEffect(() => {
    const active = tabsRef.current?.querySelector<HTMLElement>('[aria-current="step"]');
    active?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [current]);

  if (!journal) {
    return (
      <Card>
        <EmptyState
          icon="❑"
          title="היומן לא נמצא. ייתכן שנמחק או שהקישור שגוי."
          action={<button type="button" className="btn btn-primary" onClick={() => navigate('#/journals')}>לרשימת היומנים</button>}
        />
      </Card>
    );
  }

  const go = (next: number): void => {
    navigate(`#/journal/${journal.id}/${Math.min(Math.max(next, 1), STEPS.length)}`);
  };

  const props = { journalId: journal.id, goToStep: go };

  return (
    <>
      <div className="wizard-head no-print">
        <div className="spread mb-2">
          <div>
            <div className="bold">{journalNumberText(journal.journalNumber)}</div>
            <div className="small muted">שלב {current} מתוך {STEPS.length} · {STEPS[current - 1]}</div>
          </div>
          <SaveIndicator state={saveState} pending={pendingSync} online={online} />
        </div>
        <div
          className="progress-track"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={STEPS.length}
          aria-valuenow={current}
          aria-label="התקדמות באשף היומן"
        >
          <div className="progress-fill" style={{ width: `${(current / STEPS.length) * 100}%` }} />
        </div>
        <div className="step-tabs" role="tablist" aria-label="שלבי היומן" ref={tabsRef}>
          {STEPS.map((title, i) => {
            const n = i + 1;
            return (
              <button
                key={title}
                type="button"
                role="tab"
                className={`step-tab ${n < current ? 'done' : ''}`}
                aria-current={n === current ? 'step' : undefined}
                aria-selected={n === current}
                onClick={() => go(n)}
              >
                {n}. {title}
              </button>
            );
          })}
        </div>
      </div>

      <div className={`step-panel ${direction === 'back' ? 'back' : ''}`} key={current}>
        {current === 1 && <Step1Work {...props} />}
        {current === 2 && <Step2Customer {...props} />}
        {current === 3 && <Step3Findings {...props} />}
        {current === 4 && <Step4Treatment {...props} />}
        {current === 5 && <Step5Materials {...props} />}
        {current === 6 && <Step6Instructions {...props} />}
        {current === 7 && <Step7Summary {...props} />}
        {current === 8 && <Step8Signatures {...props} />}
      </div>

      <div className="wizard-footer no-print">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => go(current - 1)}
          disabled={current === 1}
        >
          הקודם
        </button>
        {current < STEPS.length ? (
          <button type="button" className="btn btn-primary btn-block" onClick={() => go(current + 1)}>
            המשך לשלב {current + 1}
          </button>
        ) : (
          <button type="button" className="btn btn-ghost" onClick={() => navigate('#/journals')}>
            לרשימת היומנים
          </button>
        )}
      </div>
    </>
  );
}

export interface StepProps {
  journalId: string;
  goToStep: (n: number) => void;
}
