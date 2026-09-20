import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { cachedFollowUpTasks, listFollowUpTasks, type FollowUpTask } from '@/lib/repo';
import { formatDateHe, formatDateTimeHe } from '@/lib/time';

/**
 * משימות ומעקבים.
 *
 * אין טבלת משימות נפרדת: המשימות הן הטיפולים המשלימים שתועדו ביומנים
 * שהושלמו (סעיף 13). כך הרשימה תמיד משקפת מידע אמיתי, ואין צורך בשינוי
 * סכמת בסיס הנתונים לצורך שינוי עיצובי.
 */
export function TasksPage(): React.JSX.Element {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<FollowUpTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setTasks(await listFollowUpTasks());
      setOffline(false);
    } catch {
      setTasks(await cachedFollowUpTasks());
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = useMemo(() => tasks.filter((task) => task.isOpen), [tasks]);
  const upcoming = useMemo(() => tasks.filter((task) => !task.isOpen), [tasks]);

  const renderTask = (task: FollowUpTask) => (
    <article className="repeat-item" key={task.logId}>
      <div className="repeat-item-head">
        <h4>{task.clientName ?? 'ללא שם מזמין'}</h4>
        <span className={`tag ${task.isOpen ? 'tag-danger' : 'tag-brand'}`}>
          {task.targetDate ? formatDateHe(task.targetDate) : 'ללא מועד'}
        </span>
      </div>
      {task.locationSummary ? <div className="small muted">{task.locationSummary}</div> : null}
      {task.description ? <p style={{ margin: '0.4rem 0 0' }}>{task.description}</p> : null}
      <div className="small dim" style={{ marginTop: '0.3rem' }}>
        מיומן מס׳ {task.serialNumber ?? '—'}
        {task.completedAt ? ` · הושלם ${formatDateTimeHe(task.completedAt)}` : ''}
      </div>
      <div className="btn-row" style={{ marginTop: '0.5rem' }}>
        <button type="button" className="btn btn-sm" onClick={() => navigate('/archive')}>
          פתיחת היומן בארכיון
        </button>
      </div>
    </article>
  );

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>משימות ומעקבים</h2>
        <p className="card-sub">
          טיפולים משלימים שתועדו ביומנים שהושלמו. משימה נחשבת פתוחה כשמועדה הגיע, או כשלא נקבע לה מועד.
        </p>

        {offline ? <Alert kind="info">אין חיבור לרשת — מוצגות המשימות שנשמרו במכשיר.</Alert> : null}

        {loading ? <SkeletonList rows={3} /> : null}

        {!loading && tasks.length === 0 ? (
          <EmptyState>אין טיפולים משלימים פתוחים. משימה נוצרת כאשר מסמנים ביומן שנדרש טיפול משלים.</EmptyState>
        ) : null}

        {open.length > 0 ? (
          <>
            <h3 style={{ marginBottom: '0.5rem' }}>לביצוע ({open.length})</h3>
            {open.map(renderTask)}
          </>
        ) : null}

        {upcoming.length > 0 ? (
          <>
            <h3 style={{ margin: '1rem 0 0.5rem' }}>מתוכננות ({upcoming.length})</h3>
            {upcoming.map(renderTask)}
          </>
        ) : null}
      </section>
    </>
  );
}
