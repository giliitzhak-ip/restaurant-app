import { navigate } from '../router';
import {
  IconCalendar, IconChevron, IconMaterials, IconProfile, IconRoute, IconTasks, IconTemplates,
} from '../components/icons';
import { Card } from '../components/ui';
import { useStore } from '../state/store';

const LINKS = [
  { path: '#/route', Icon: IconRoute, label: 'מסלול עבודה' },
  { path: '#/templates', Icon: IconTemplates, label: 'תבניות' },
  { path: '#/tasks', Icon: IconTasks, label: 'משימות' },
  { path: '#/calendar', Icon: IconCalendar, label: 'לוח שנה' },
  { path: '#/materials', Icon: IconMaterials, label: 'חומרים' },
  { path: '#/profile', Icon: IconProfile, label: 'פרופיל' },
];

export function MoreScreen({ onNewJournal }: { onNewJournal: () => void }) {
  const { state, pendingSync, online } = useStore();

  return (
    <>
      <Card>
        <div className="card-title"><h2>עוד</h2></div>
        <div className="list">
          {LINKS.map((l) => (
            <button key={l.path} type="button" className="list-row" onClick={() => navigate(l.path)}>
              <span aria-hidden="true" className="row-icon"><l.Icon /></span>
              <span className="grow"><span className="ttl">{l.label}</span></span>
              <span aria-hidden="true" className="row-icon"><IconChevron /></span>
            </button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-block mt-3" onClick={onNewJournal}>
          יומן חדש
        </button>
      </Card>

      <Card>
        <div className="card-title"><h3>מצב המערכת</h3></div>
        <ul className="small">
          <li>יומנים: {state.journals.length}</li>
          <li>לקוחות: {state.customers.length}</li>
          <li>חומרים במאגר: {state.materials.length}</li>
          <li>תבניות: {state.treatmentTemplates.length + state.customerTemplates.length}</li>
          <li>סנכרון: {online ? 'מחובר' : 'לא מחובר'} · {pendingSync} ממתינים</li>
        </ul>
      </Card>
    </>
  );
}
