import { useState } from 'react';
import { ComboField, SelectField, TextField } from '@/components/Fields';
import { Alert } from '@/components/Common';
import {
  OPEN_AREA_SITE_TYPE_SUGGESTIONS,
  PLACE_KIND_LABELS,
  STRUCTURE_TYPE_SUGGESTIONS,
  TREATMENT_KIND_LABELS,
  type PlaceKind,
  type TreatmentKind,
} from '@/schema/enums';
import { getAtPath, getString } from '@/lib/paths';
import { serverNowIso, toDateInput, toTimeInput, serverNow, hasSignificantClockDrift } from '@/lib/time';
import type { StepProps } from './stepProps';

/** שלב 2 — מקום ההדברה (דרישה 4) ותאריך ושעת הביצוע בפועל (דרישה 5). */
export function Step2Location({ draft, reference, errors }: StepProps): React.JSX.Element {
  const { content, setField, setFields, readOnly } = draft;
  const [gpsStatus, setGpsStatus] = useState<string | null>(null);

  const placeKind = (getString(content, 'location.placeKind') || 'dwelling') as PlaceKind;
  const treatmentKinds = (getAtPath(content, 'treatmentKinds') as TreatmentKind[] | undefined) ?? [];
  const coordinateSystem = getString(content, 'location.coordinates.system') || 'wgs84';

  const siteOptions = reference.sites.map((site) => ({
    value: site.id,
    label: site.label,
    sublabel: PLACE_KIND_LABELS[site.placeKind],
  }));

  /**
   * כתיבת ערך נ״צ יחד עם שיטת הציון.
   * בלי זה, שיטת הציון הייתה רק ברירת מחדל בתצוגה ולא נשמרת בתוכן,
   * והוולידציה הייתה נכשלת על "יש לבחור סוג מהרשימה" בלי שהמשתמש
   * יבין מה חסר.
   */
  const setCoordinate = (path: string, value: string) => {
    setFields([
      { path: 'location.coordinates.system', value: coordinateSystem },
      { path, value },
    ]);
  };

  const toggleTreatmentKind = (kind: TreatmentKind) => {
    const next = treatmentKinds.includes(kind)
      ? treatmentKinds.filter((k) => k !== kind)
      : [...treatmentKinds, kind];
    setField('treatmentKinds', next.length > 0 ? next : ['standard']);
  };

  const captureGps = () => {
    if (!navigator.geolocation) {
      setGpsStatus('המכשיר אינו תומך באיתור מיקום.');
      return;
    }
    setGpsStatus('מאתר מיקום…');
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setFields([
          { path: 'location.coordinates.system', value: 'wgs84' },
          { path: 'location.coordinates.latitude', value: Number(position.coords.latitude.toFixed(6)) },
          { path: 'location.coordinates.longitude', value: Number(position.coords.longitude.toFixed(6)) },
          { path: 'location.coordinates.accuracyMeters', value: Math.round(position.coords.accuracy) },
          { path: 'location.coordinates.capturedAt', value: serverNowIso() },
        ]);
        setGpsStatus(`נקלט מיקום בדיוק של כ-${Math.round(position.coords.accuracy)} מטר.`);
      },
      (error) => setGpsStatus(`איתור המיקום נכשל: ${error.message}`),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  };

  const fillNow = () => {
    const now = serverNow();
    setFields([
      { path: 'execution.performedDate', value: toDateInput(now) },
      { path: 'execution.performedStartTime', value: toTimeInput(now) },
      { path: 'execution.timeZone', value: 'Asia/Jerusalem' },
    ]);
  };

  return (
    <>
      <section className="card" aria-labelledby="step2-kind">
        <h2 id="step2-kind">
          סוג ההדברה<span className="req-ref">משפיע על שדות החובה</span>
        </h2>
        <fieldset>
          <legend>סוגי ההדברה שבוצעו (ניתן לבחור יותר מאחד)</legend>
          {(Object.keys(TREATMENT_KIND_LABELS) as TreatmentKind[]).map((kind) => (
            <div className="checkbox-row" key={kind}>
              <input
                id={`treatment-${kind}`}
                type="checkbox"
                checked={treatmentKinds.includes(kind)}
                disabled={readOnly}
                onChange={() => toggleTreatmentKind(kind)}
              />
              <label htmlFor={`treatment-${kind}`}>{TREATMENT_KIND_LABELS[kind]}</label>
            </div>
          ))}
        </fieldset>
        {errors.get('treatmentKinds') ? (
          <div className="field-error" role="alert">
            {errors.get('treatmentKinds')}
          </div>
        ) : null}
        {treatmentKinds.includes('fumigation') ? (
          <Alert kind="info">באיוד — יש לתעד בשלב 4 את פעולות האיטום שבוצעו לפני האיוד (סעיף 10).</Alert>
        ) : null}
        {treatmentKinds.includes('fogging') ? (
          <Alert kind="info">
            בערפול — יש לבחור מקום מסוג "ערפול (שכונה)", ולתעד בשלב 4 אם ניתנה לציבור התראה מראש (סעיף 11).
          </Alert>
        ) : null}
      </section>

      <section className="card" aria-labelledby="step2-location">
        <h2 id="step2-location">
          מקום ההדברה<span className="req-ref">סעיף 4</span>
        </h2>

        <ComboField
          path="location.siteId"
          label="בחירת אתר שמור"
          value={getString(content, 'location.siteLabel')}
          disabled={readOnly}
          onChange={(value) => setField('location.siteLabel', value)}
          options={siteOptions}
          hint="בחירה מהרשימה תמלא את פרטי המקום. ניתן גם להזין מקום חדש ידנית."
          onSelectOption={(option) => {
            const site = reference.sites.find((s) => s.id === option.value);
            if (!site) return;
            setFields([
              { path: 'location.siteLabel', value: site.label },
              { path: 'location.siteId', value: site.id },
              { path: 'location.placeKind', value: site.placeKind },
              { path: 'location.city', value: site.city ?? '' },
              { path: 'location.street', value: site.street ?? '' },
              { path: 'location.houseNumber', value: site.houseNumber ?? '' },
              { path: 'location.apartmentNumber', value: site.apartmentNumber ?? '' },
              { path: 'location.structureType', value: site.structureType ?? '' },
              { path: 'location.localAuthorityName', value: site.localAuthorityName ?? '' },
              { path: 'location.siteType', value: site.siteType ?? '' },
              { path: 'location.siteDescription', value: site.siteDescription ?? '' },
              { path: 'location.neighborhoodName', value: site.neighborhoodName ?? '' },
              { path: 'location.areaDescription', value: site.areaDescription ?? '' },
            ]);
          }}
        />

        <SelectField
          path="location.placeKind"
          label="סוג מקום ההדברה"
          required
          disabled={readOnly}
          value={placeKind}
          onChange={(value) => setField('location.placeKind', value)}
          error={errors.get('location.placeKind')}
          options={(Object.keys(PLACE_KIND_LABELS) as PlaceKind[]).map((kind) => ({
            value: kind,
            label: PLACE_KIND_LABELS[kind],
          }))}
        />

        {placeKind === 'dwelling' ? (
          <>
            <div className="field-row">
              <TextField
                path="location.city"
                label="עיר"
                required
                disabled={readOnly}
                value={getString(content, 'location.city')}
                onChange={(value) => setField('location.city', value)}
                error={errors.get('location.city')}
              />
              <TextField
                path="location.street"
                label="רחוב"
                required
                disabled={readOnly}
                value={getString(content, 'location.street')}
                onChange={(value) => setField('location.street', value)}
                error={errors.get('location.street')}
              />
            </div>
            <div className="field-row">
              <TextField
                path="location.houseNumber"
                label="מספר בית"
                required
                disabled={readOnly}
                value={getString(content, 'location.houseNumber')}
                onChange={(value) => setField('location.houseNumber', value)}
                error={errors.get('location.houseNumber')}
              />
              <TextField
                path="location.apartmentNumber"
                label="מספר דירה"
                disabled={readOnly}
                value={getString(content, 'location.apartmentNumber')}
                onChange={(value) => setField('location.apartmentNumber', value)}
                error={errors.get('location.apartmentNumber')}
                hint="חובה כאשר סוג המבנה הוא דירה."
              />
            </div>
            <ComboField
              path="location.structureType"
              label="סוג המבנה"
              required
              disabled={readOnly}
              value={getString(content, 'location.structureType')}
              onChange={(value) => setField('location.structureType', value)}
              error={errors.get('location.structureType')}
              options={STRUCTURE_TYPE_SUGGESTIONS.map((type) => ({ value: type, label: type }))}
            />
          </>
        ) : null}

        {placeKind === 'open_area' ? (
          <>
            <TextField
              path="location.localAuthorityName"
              label="שם הרשות המקומית"
              required
              disabled={readOnly}
              value={getString(content, 'location.localAuthorityName')}
              onChange={(value) => setField('location.localAuthorityName', value)}
              error={errors.get('location.localAuthorityName')}
            />
            <ComboField
              path="location.siteType"
              label="סוג האתר"
              required
              disabled={readOnly}
              value={getString(content, 'location.siteType')}
              onChange={(value) => setField('location.siteType', value)}
              error={errors.get('location.siteType')}
              options={OPEN_AREA_SITE_TYPE_SUGGESTIONS.map((type) => ({ value: type, label: type }))}
            />
            <TextField
              path="location.siteDescription"
              label="תיאור האתר"
              required
              disabled={readOnly}
              value={getString(content, 'location.siteDescription')}
              onChange={(value) => setField('location.siteDescription', value)}
              error={errors.get('location.siteDescription')}
            />
          </>
        ) : null}

        {placeKind === 'fogging_area' ? (
          <>
            <div className="field-row">
              <TextField
                path="location.neighborhoodName"
                label="שם השכונה"
                required
                disabled={readOnly}
                value={getString(content, 'location.neighborhoodName')}
                onChange={(value) => setField('location.neighborhoodName', value)}
                error={errors.get('location.neighborhoodName')}
              />
              <TextField
                path="location.city"
                label="עיר"
                required
                disabled={readOnly}
                value={getString(content, 'location.city')}
                onChange={(value) => setField('location.city', value)}
                error={errors.get('location.city')}
              />
            </div>
            <TextField
              path="location.localAuthorityName"
              label="שם הרשות המקומית"
              required
              disabled={readOnly}
              value={getString(content, 'location.localAuthorityName')}
              onChange={(value) => setField('location.localAuthorityName', value)}
              error={errors.get('location.localAuthorityName')}
            />
            <TextField
              path="location.areaDescription"
              label="תיאור השטח המערופל"
              required
              disabled={readOnly}
              value={getString(content, 'location.areaDescription')}
              onChange={(value) => setField('location.areaDescription', value)}
              error={errors.get('location.areaDescription')}
            />
          </>
        ) : null}

        <fieldset>
          <legend>
            נ״צ (קואורדינטות){placeKind !== 'dwelling' ? <span className="required-mark"> *</span> : null}
          </legend>

          <SelectField
            path="location.coordinates.system"
            label="שיטת הציון"
            disabled={readOnly}
            value={coordinateSystem}
            onChange={(value) => setField('location.coordinates.system', value)}
            options={[
              { value: 'wgs84', label: 'קו רוחב/אורך (WGS84)' },
              { value: 'itm', label: 'רשת ישראל החדשה (ITM)' },
            ]}
          />

          {coordinateSystem === 'itm' ? (
            <div className="field-row">
              <TextField
                path="location.coordinates.east"
                label="מזרח"
                type="number"
                inputMode="decimal"
                disabled={readOnly}
                value={getString(content, 'location.coordinates.east')}
                onChange={(value) => setCoordinate('location.coordinates.east', value)}
                error={errors.get('location.coordinates.east')}
              />
              <TextField
                path="location.coordinates.north"
                label="צפון"
                type="number"
                inputMode="decimal"
                disabled={readOnly}
                value={getString(content, 'location.coordinates.north')}
                onChange={(value) => setCoordinate('location.coordinates.north', value)}
                error={errors.get('location.coordinates.north')}
              />
            </div>
          ) : (
            <div className="field-row">
              <TextField
                path="location.coordinates.latitude"
                label="קו רוחב"
                type="number"
                inputMode="decimal"
                step="0.000001"
                disabled={readOnly}
                value={getString(content, 'location.coordinates.latitude')}
                onChange={(value) => setCoordinate('location.coordinates.latitude', value)}
                error={errors.get('location.coordinates.latitude')}
              />
              <TextField
                path="location.coordinates.longitude"
                label="קו אורך"
                type="number"
                inputMode="decimal"
                step="0.000001"
                disabled={readOnly}
                value={getString(content, 'location.coordinates.longitude')}
                onChange={(value) => setCoordinate('location.coordinates.longitude', value)}
                error={errors.get('location.coordinates.longitude')}
              />
            </div>
          )}

          <div className="btn-row">
            <button type="button" className="btn btn-sm" onClick={captureGps} disabled={readOnly}>
              קליטת מיקום מה-GPS
            </button>
          </div>
          {gpsStatus ? (
            <div className="hint" role="status" aria-live="polite">
              {gpsStatus}
            </div>
          ) : null}
          {errors.get('location.coordinates') ? (
            <div className="field-error" role="alert">
              {errors.get('location.coordinates')}
            </div>
          ) : null}
        </fieldset>
      </section>

      <section className="card" aria-labelledby="step2-execution">
        <h2 id="step2-execution">
          תאריך ושעת ביצוע ההדברה בפועל<span className="req-ref">סעיף 5</span>
        </h2>

        {hasSignificantClockDrift() ? (
          <Alert kind="warning" title="שעון המכשיר אינו מסונכרן">
            נמצא פער משמעותי בין שעון המכשיר לשעון השרת. מועד ההשלמה של היומן נקבע תמיד לפי שעון השרת.
          </Alert>
        ) : null}

        <div className="field-row-3">
          <TextField
            path="execution.performedDate"
            label="תאריך הביצוע"
            required
            type="date"
            disabled={readOnly}
            value={getString(content, 'execution.performedDate')}
            onChange={(value) => setField('execution.performedDate', value)}
            error={errors.get('execution.performedDate')}
          />
          <TextField
            path="execution.performedStartTime"
            label="שעת תחילה"
            required
            type="time"
            disabled={readOnly}
            value={getString(content, 'execution.performedStartTime')}
            onChange={(value) => setField('execution.performedStartTime', value)}
            error={errors.get('execution.performedStartTime')}
          />
          <TextField
            path="execution.performedEndTime"
            label="שעת סיום"
            type="time"
            disabled={readOnly}
            value={getString(content, 'execution.performedEndTime')}
            onChange={(value) => setField('execution.performedEndTime', value)}
            error={errors.get('execution.performedEndTime')}
          />
        </div>

        <div className="btn-row">
          <button type="button" className="btn btn-sm" onClick={fillNow} disabled={readOnly}>
            מילוי לפי הזמן הנוכחי
          </button>
        </div>
      </section>
    </>
  );
}
