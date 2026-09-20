import { useCallback, useEffect, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { SkeletonList } from '@/components/Skeleton';
import { listLicenses, type LicenseRow } from '@/lib/repo';
import { formatDateHe } from '@/lib/time';

const ROLE_LABELS: Record<string, string> = {
  owner: 'בעלים',
  manager: 'מנהל',
  exterminator: 'מדביר',
  viewer: 'צפייה בלבד',
};

/** פרופיל המדביר והרישיונות שלו. */
export function ProfilePage(): React.JSX.Element {
  const { profile } = useApp();
  const [licenses, setLicenses] = useState<LicenseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setLicenses(await listLicenses());
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const expired = (license: LicenseRow): boolean =>
    Boolean(license.validUntil && new Date(`${license.validUntil}T23:59:59Z`).getTime() < Date.now());

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>פרופיל המדביר</h2>

        <div className="field">
          <span className="field-label">שם מלא</span>
          <div>{profile?.fullName ?? '—'}</div>
        </div>
        <div className="field-row">
          <div className="field">
            <span className="field-label">דוא״ל</span>
            <div>{profile?.email ?? '—'}</div>
          </div>
          <div className="field">
            <span className="field-label">טלפון</span>
            <div>{profile?.phone ?? '—'}</div>
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <span className="field-label">תפקיד</span>
            <div>{profile ? (ROLE_LABELS[profile.role] ?? profile.role) : '—'}</div>
          </div>
          <div className="field">
            <span className="field-label">העסק</span>
            <div>{profile?.organizationName ?? '—'}</div>
          </div>
        </div>
      </section>

      <section className="card">
        <h3>רישיונות הדברה</h3>
        <p className="card-sub">הרישיונות שמשויכים לעסק. פרטי הרישיון נכנסים ליומן (סעיף 1).</p>

        {error ? (
          <Alert kind="error">
            {error}
            <div className="btn-row" style={{ marginTop: '0.5rem' }}>
              <button type="button" className="btn btn-sm" onClick={() => void load()}>
                נסה שוב
              </button>
            </div>
          </Alert>
        ) : null}

        {loading ? <SkeletonList rows={2} /> : null}

        {!loading && licenses.length === 0 ? <EmptyState>לא נרשמו רישיונות.</EmptyState> : null}

        {licenses.map((license) => (
          <article className="repeat-item" key={license.id}>
            <div className="repeat-item-head">
              <h4>{license.licenseType}</h4>
              <span className={`tag ${expired(license) ? 'tag-danger' : license.isActive ? 'tag-success' : 'tag-warning'}`}>
                {expired(license) ? 'פג תוקף' : license.isActive ? 'בתוקף' : 'לא פעיל'}
              </span>
            </div>
            <div className="small">
              <div>בעל הרישיון: {license.holderName}</div>
              <div>מספר רישיון: {license.licenseNumber}</div>
              {license.validUntil ? <div>בתוקף עד: {formatDateHe(license.validUntil)}</div> : null}
              {license.mobile ? <div>נייד: {license.mobile}</div> : null}
              {license.email ? <div>דוא״ל: {license.email}</div> : null}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
