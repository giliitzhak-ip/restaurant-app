import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { CheckboxField, SelectField, TextField } from '@/components/Fields';
import { PLACE_KIND_LABELS, type PlaceKind } from '@/schema/enums';
import { newUuid } from '@/lib/ids';
import { serverNowIso } from '@/lib/time';

/**
 * ניהול מזמינים ואתרים.
 *
 * הכתיבה עוברת דרך תור הסנכרון, כך שאפשר להוסיף לקוח גם ללא קליטה.
 * מסך זה מצמצם הקלדה בשדה: לקוח ואתר שנשמרו כאן ממלאים אוטומטית את
 * שלבים 1 ו-2 באשף.
 */

interface ClientDraft {
  id: string;
  name: string;
  isPrivatePerson: boolean;
  phone: string;
  mobile: string;
  email: string;
  contactRole: string;
  address: string;
}

interface SiteDraft {
  id: string;
  clientId: string;
  label: string;
  placeKind: PlaceKind;
  city: string;
  street: string;
  houseNumber: string;
  apartmentNumber: string;
  structureType: string;
  localAuthorityName: string;
  siteType: string;
  siteDescription: string;
  neighborhoodName: string;
  areaDescription: string;
}

function emptyClient(): ClientDraft {
  return {
    id: newUuid(),
    name: '',
    isPrivatePerson: false,
    phone: '',
    mobile: '',
    email: '',
    contactRole: '',
    address: '',
  };
}

function emptySite(clientId: string): SiteDraft {
  return {
    id: newUuid(),
    clientId,
    label: '',
    placeKind: 'dwelling',
    city: '',
    street: '',
    houseNumber: '',
    apartmentNumber: '',
    structureType: '',
    localAuthorityName: '',
    siteType: '',
    siteDescription: '',
    neighborhoodName: '',
    areaDescription: '',
  };
}

export function ClientsPage(): React.JSX.Element {
  const { profile, reference, syncEngine, refreshReference, syncStatus } = useApp();
  const [clientDraft, setClientDraft] = useState<ClientDraft | null>(null);
  const [siteDraft, setSiteDraft] = useState<SiteDraft | null>(null);
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState<{ kind: 'success' | 'error' | 'info'; text: string } | null>(null);

  const visibleClients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return reference.clients;
    return reference.clients.filter(
      (client) =>
        client.name.toLowerCase().includes(needle) ||
        (client.phone ?? '').includes(needle) ||
        (client.address ?? '').toLowerCase().includes(needle),
    );
  }, [reference.clients, query]);

  const saveClient = async () => {
    if (!clientDraft || !profile) return;
    if (clientDraft.name.trim().length === 0) {
      setMessage({ kind: 'error', text: 'שם המזמין הוא שדה חובה.' });
      return;
    }

    await syncEngine.enqueue(
      'upsert_client',
      clientDraft.id,
      {
        row: {
          id: clientDraft.id,
          organization_id: profile.organizationId,
          name: clientDraft.name.trim(),
          is_private_person: clientDraft.isPrivatePerson,
          phone: clientDraft.phone.trim() || null,
          mobile: clientDraft.mobile.trim() || null,
          email: clientDraft.email.trim() || null,
          contact_role: clientDraft.contactRole.trim() || null,
          address: clientDraft.address.trim() || null,
          updated_at: serverNowIso(),
        },
      },
      clientDraft.name.trim().slice(0, 16),
    );

    setMessage({
      kind: syncStatus.isOnline ? 'success' : 'info',
      text: syncStatus.isOnline
        ? 'המזמין נשמר.'
        : 'המזמין נשמר במכשיר ויסונכרן כשהחיבור יחזור.',
    });
    setClientDraft(null);
    await refreshReference();
  };

  const saveSite = async () => {
    if (!siteDraft || !profile) return;
    if (siteDraft.label.trim().length === 0) {
      setMessage({ kind: 'error', text: 'שם האתר הוא שדה חובה.' });
      return;
    }

    await syncEngine.enqueue(
      'upsert_site',
      siteDraft.id,
      {
        row: {
          id: siteDraft.id,
          organization_id: profile.organizationId,
          client_id: siteDraft.clientId,
          label: siteDraft.label.trim(),
          place_kind: siteDraft.placeKind,
          city: siteDraft.city.trim() || null,
          street: siteDraft.street.trim() || null,
          house_number: siteDraft.houseNumber.trim() || null,
          apartment_number: siteDraft.apartmentNumber.trim() || null,
          structure_type: siteDraft.structureType.trim() || null,
          local_authority_name: siteDraft.localAuthorityName.trim() || null,
          site_type: siteDraft.siteType.trim() || null,
          site_description: siteDraft.siteDescription.trim() || null,
          neighborhood_name: siteDraft.neighborhoodName.trim() || null,
          area_description: siteDraft.areaDescription.trim() || null,
          updated_at: serverNowIso(),
        },
      },
      siteDraft.label.trim().slice(0, 16),
    );

    setMessage({
      kind: syncStatus.isOnline ? 'success' : 'info',
      text: syncStatus.isOnline ? 'האתר נשמר.' : 'האתר נשמר במכשיר ויסונכרן כשהחיבור יחזור.',
    });
    setSiteDraft(null);
    await refreshReference();
  };

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <div className="spread">
          <h2 style={{ margin: 0 }}>מזמינים ואתרים</h2>
          <button type="button" className="btn btn-sm btn-primary" onClick={() => setClientDraft(emptyClient())}>
            + מזמין חדש
          </button>
        </div>
        <p className="card-sub">מזמין ואתר שנשמרים כאן ממלאים אוטומטית את שלבים 1 ו-2 באשף.</p>

        {message ? <Alert kind={message.kind}>{message.text}</Alert> : null}

        <div className="field">
          <label htmlFor="clients-search">חיפוש</label>
          <input
            id="clients-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="שם, טלפון או כתובת"
          />
        </div>
      </section>

      {clientDraft ? (
        <section className="card" aria-label="פרטי מזמין">
          <h3>מזמין חדש</h3>
          <TextField
            path="newClient.name"
            label="שם המזמין"
            required
            value={clientDraft.name}
            onChange={(value) => setClientDraft({ ...clientDraft, name: value })}
          />
          <CheckboxField
            path="newClient.isPrivatePerson"
            label="אדם פרטי"
            checked={clientDraft.isPrivatePerson}
            onChange={(checked) => setClientDraft({ ...clientDraft, isPrivatePerson: checked })}
            hint="כאשר המזמין אדם פרטי — מספר הנייד חובה ביומן."
          />
          <div className="field-row">
            <TextField
              path="newClient.phone"
              label="טלפון"
              type="tel"
              value={clientDraft.phone}
              onChange={(value) => setClientDraft({ ...clientDraft, phone: value })}
            />
            <TextField
              path="newClient.mobile"
              label="נייד"
              type="tel"
              value={clientDraft.mobile}
              onChange={(value) => setClientDraft({ ...clientDraft, mobile: value })}
            />
          </div>
          <div className="field-row">
            <TextField
              path="newClient.email"
              label="דוא״ל"
              type="email"
              value={clientDraft.email}
              onChange={(value) => setClientDraft({ ...clientDraft, email: value })}
            />
            <TextField
              path="newClient.contactRole"
              label="תפקיד איש הקשר"
              value={clientDraft.contactRole}
              onChange={(value) => setClientDraft({ ...clientDraft, contactRole: value })}
            />
          </div>
          <TextField
            path="newClient.address"
            label="כתובת"
            value={clientDraft.address}
            onChange={(value) => setClientDraft({ ...clientDraft, address: value })}
          />
          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void saveClient()}>
              שמירת המזמין
            </button>
            <button type="button" className="btn" onClick={() => setClientDraft(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      {siteDraft ? (
        <section className="card" aria-label="פרטי אתר">
          <h3>אתר חדש</h3>
          <TextField
            path="newSite.label"
            label="שם האתר"
            required
            value={siteDraft.label}
            onChange={(value) => setSiteDraft({ ...siteDraft, label: value })}
            hint="לדוגמה: חדר אשפה — רחוב הדוגמה 10"
          />
          <SelectField
            path="newSite.placeKind"
            label="סוג המקום"
            required
            value={siteDraft.placeKind}
            onChange={(value) => setSiteDraft({ ...siteDraft, placeKind: value as PlaceKind })}
            options={(Object.keys(PLACE_KIND_LABELS) as PlaceKind[]).map((kind) => ({
              value: kind,
              label: PLACE_KIND_LABELS[kind],
            }))}
          />

          {siteDraft.placeKind === 'dwelling' ? (
            <>
              <div className="field-row">
                <TextField
                  path="newSite.city"
                  label="עיר"
                  value={siteDraft.city}
                  onChange={(value) => setSiteDraft({ ...siteDraft, city: value })}
                />
                <TextField
                  path="newSite.street"
                  label="רחוב"
                  value={siteDraft.street}
                  onChange={(value) => setSiteDraft({ ...siteDraft, street: value })}
                />
              </div>
              <div className="field-row-3">
                <TextField
                  path="newSite.houseNumber"
                  label="מספר בית"
                  value={siteDraft.houseNumber}
                  onChange={(value) => setSiteDraft({ ...siteDraft, houseNumber: value })}
                />
                <TextField
                  path="newSite.apartmentNumber"
                  label="מספר דירה"
                  value={siteDraft.apartmentNumber}
                  onChange={(value) => setSiteDraft({ ...siteDraft, apartmentNumber: value })}
                />
                <TextField
                  path="newSite.structureType"
                  label="סוג המבנה"
                  value={siteDraft.structureType}
                  onChange={(value) => setSiteDraft({ ...siteDraft, structureType: value })}
                />
              </div>
            </>
          ) : null}

          {siteDraft.placeKind === 'open_area' ? (
            <>
              <TextField
                path="newSite.localAuthorityName"
                label="שם הרשות המקומית"
                value={siteDraft.localAuthorityName}
                onChange={(value) => setSiteDraft({ ...siteDraft, localAuthorityName: value })}
              />
              <TextField
                path="newSite.siteType"
                label="סוג האתר"
                value={siteDraft.siteType}
                onChange={(value) => setSiteDraft({ ...siteDraft, siteType: value })}
              />
              <TextField
                path="newSite.siteDescription"
                label="תיאור האתר"
                value={siteDraft.siteDescription}
                onChange={(value) => setSiteDraft({ ...siteDraft, siteDescription: value })}
              />
            </>
          ) : null}

          {siteDraft.placeKind === 'fogging_area' ? (
            <>
              <div className="field-row">
                <TextField
                  path="newSite.neighborhoodName"
                  label="שם השכונה"
                  value={siteDraft.neighborhoodName}
                  onChange={(value) => setSiteDraft({ ...siteDraft, neighborhoodName: value })}
                />
                <TextField
                  path="newSite.city"
                  label="עיר"
                  value={siteDraft.city}
                  onChange={(value) => setSiteDraft({ ...siteDraft, city: value })}
                />
              </div>
              <TextField
                path="newSite.localAuthorityName"
                label="שם הרשות המקומית"
                value={siteDraft.localAuthorityName}
                onChange={(value) => setSiteDraft({ ...siteDraft, localAuthorityName: value })}
              />
              <TextField
                path="newSite.areaDescription"
                label="תיאור השטח המערופל"
                value={siteDraft.areaDescription}
                onChange={(value) => setSiteDraft({ ...siteDraft, areaDescription: value })}
              />
            </>
          ) : null}

          <div className="btn-row">
            <button type="button" className="btn btn-primary" onClick={() => void saveSite()}>
              שמירת האתר
            </button>
            <button type="button" className="btn" onClick={() => setSiteDraft(null)}>
              ביטול
            </button>
          </div>
        </section>
      ) : null}

      <section className="card">
        <h3>מזמינים ({visibleClients.length})</h3>
        {visibleClients.length === 0 ? (
          <EmptyState>לא נמצאו מזמינים.</EmptyState>
        ) : (
          visibleClients.map((client) => {
            const sites = reference.sites.filter((site) => site.clientId === client.id);
            return (
              <article className="repeat-item" key={client.id}>
                <div className="repeat-item-head">
                  <h4>{client.name}</h4>
                  <span className="tag">{client.isPrivatePerson ? 'אדם פרטי' : 'גוף / ועד'}</span>
                </div>
                <div className="small muted">
                  {[client.contactRole, client.phone, client.mobile, client.address].filter(Boolean).join(' · ') || '—'}
                </div>

                {sites.length > 0 ? (
                  <ul className="small" style={{ margin: '0.4rem 0 0', paddingInlineStart: '1.1rem' }}>
                    {sites.map((site) => (
                      <li key={site.id}>
                        {site.label} <span className="dim">· {PLACE_KIND_LABELS[site.placeKind]}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="small dim" style={{ margin: '0.4rem 0 0' }}>
                    אין אתרים שמורים.
                  </p>
                )}

                <div className="btn-row" style={{ marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-sm" onClick={() => setSiteDraft(emptySite(client.id))}>
                    + אתר למזמין הזה
                  </button>
                </div>
              </article>
            );
          })
        )}
      </section>
    </>
  );
}
