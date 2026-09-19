import { CheckboxField, ComboField, SelectField, TextAreaField, TextField } from '@/components/Fields';
import { Alert, EmptyState } from '@/components/Common';
import {
  APPLICATION_METHOD_SUGGESTIONS,
  BASIS_UNIT_SUGGESTIONS,
  DOSAGE_UNIT_SUGGESTIONS,
  MIXTURE_KIND_LABELS,
  MIXTURE_UNIT_SUGGESTIONS,
  PREVENTION_STATUS_LABELS,
  QUANTITY_BASIS_LABELS,
  type MixtureKind,
  type PreventionStatus,
  type QuantityBasis,
  type TreatmentKind,
} from '@/schema/enums';
import { BAIT_STATION_STATUS_LABELS } from '@/schema/sections';
import { productWarnings } from '@/schema/product';
import { getArray, getAtPath, getBoolean, getString } from '@/lib/paths';
import { serverNow, serverNowIso } from '@/lib/time';
import { newUuid } from '@/lib/ids';
import type { StepProps } from './stepProps';

/**
 * שלב 4 — פעולות מניעה (סעיף 7), תכשירים ויישום (סעיף 12),
 * איוד (סעיף 10), ערפול (סעיף 11) ותחנות האכלה.
 */
export function Step4Treatment({ draft, reference, errors }: StepProps): React.JSX.Element {
  const { content, setField, setFields, removeAt, appendTo, readOnly } = draft;
  const treatmentKinds = (getAtPath(content, 'treatmentKinds') as TreatmentKind[] | undefined) ?? [];
  const preventionActions = getArray(content, 'prevention.actions');
  const applications = getArray(content, 'applications');
  const sealingActions = getArray(content, 'fumigation.sealingActions');
  const baitStations = getArray(content, 'baitStations');
  const monitoredPests = getArray(content, 'monitoring.findings')
    .map((f) => getString(f, 'pestName'))
    .filter(Boolean);

  const now = serverNow();

  const productOptions = reference.products.map((product) => ({
    value: product.id,
    label: product.tradeName,
    sublabel: `${product.activeIngredientName} · ${product.activeIngredientConcentrationPercent}% · ${product.sourceName}`,
  }));

  return (
    <>
      {/* ── סעיף 7 ── */}
      <section className="card" aria-labelledby="step4-prevention">
        <h2 id="step4-prevention">
          פעולות מניעה וטיפול<span className="req-ref">סעיף 7</span>
        </h2>
        <p className="card-sub">פעולות שנבדקו, הומלצו או בוצעו לפני ההדברה.</p>

        {preventionActions.length === 0 ? (
          <EmptyState>
            טרם נרשמו פעולות מניעה.
            {errors.get('prevention.actions') ? (
              <div className="field-error" role="alert">
                {errors.get('prevention.actions')}
              </div>
            ) : null}
          </EmptyState>
        ) : null}

        {preventionActions.map((_, index) => {
          const base = `prevention.actions.${index}`;
          return (
            <div className="repeat-item" key={base}>
              <div className="repeat-item-head">
                <h4>פעולה {index + 1}</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={readOnly}
                  onClick={() => removeAt(base)}
                  aria-label={`הסרת פעולת מניעה ${index + 1}`}
                >
                  הסרה
                </button>
              </div>
              <TextField
                path={`${base}.description`}
                label="תיאור הפעולה"
                required
                disabled={readOnly}
                value={getString(content, `${base}.description`)}
                onChange={(value) => setField(`${base}.description`, value)}
                error={errors.get(`${base}.description`)}
              />
              <SelectField
                path={`${base}.status`}
                label="מצב הפעולה"
                required
                disabled={readOnly}
                value={getString(content, `${base}.status`) || 'checked'}
                onChange={(value) => setField(`${base}.status`, value)}
                error={errors.get(`${base}.status`)}
                options={(Object.keys(PREVENTION_STATUS_LABELS) as PreventionStatus[]).map((status) => ({
                  value: status,
                  label: PREVENTION_STATUS_LABELS[status],
                }))}
              />
              <TextField
                path={`${base}.notes`}
                label="הערות"
                disabled={readOnly}
                value={getString(content, `${base}.notes`)}
                onChange={(value) => setField(`${base}.notes`, value)}
              />
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-block"
          disabled={readOnly}
          onClick={() => appendTo('prevention.actions', { description: '', status: 'checked' })}
        >
          + הוספת פעולת מניעה
        </button>

        <TextAreaField
          path="prevention.circumstancesForChoosingPestControl"
          label="הנסיבות שבגללן הוחלט לבצע הדברה ולא טיפול אחר"
          required
          rows={4}
          disabled={readOnly}
          value={getString(content, 'prevention.circumstancesForChoosingPestControl')}
          onChange={(value) => setField('prevention.circumstancesForChoosingPestControl', value)}
          error={errors.get('prevention.circumstancesForChoosingPestControl')}
        />
      </section>

      {/* ── סעיף 10 ── */}
      {treatmentKinds.includes('fumigation') ? (
        <section className="card" aria-labelledby="step4-fumigation">
          <h2 id="step4-fumigation">
            איוד — פעולות איטום<span className="req-ref">סעיף 10</span>
          </h2>
          <p className="card-sub">תיעוד פעולות האיטום שבוצעו לפני האיוד.</p>

          {errors.get('fumigation') ? (
            <div className="field-error" role="alert">
              {errors.get('fumigation')}
            </div>
          ) : null}

          {sealingActions.map((_, index) => {
            const base = `fumigation.sealingActions.${index}`;
            return (
              <div className="repeat-item" key={base}>
                <div className="repeat-item-head">
                  <h4>איטום {index + 1}</h4>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={readOnly}
                    onClick={() => removeAt(base)}
                  >
                    הסרה
                  </button>
                </div>
                <TextField
                  path={`${base}.description`}
                  label="תיאור פעולת האיטום"
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.description`)}
                  onChange={(value) => setField(`${base}.description`, value)}
                  error={errors.get(`${base}.description`)}
                />
                <div className="field-row">
                  <TextField
                    path={`${base}.locationDescription`}
                    label="מיקום האיטום"
                    required
                    disabled={readOnly}
                    value={getString(content, `${base}.locationDescription`)}
                    onChange={(value) => setField(`${base}.locationDescription`, value)}
                    error={errors.get(`${base}.locationDescription`)}
                  />
                  <TextField
                    path={`${base}.materialUsed`}
                    label="חומר האיטום"
                    disabled={readOnly}
                    value={getString(content, `${base}.materialUsed`)}
                    onChange={(value) => setField(`${base}.materialUsed`, value)}
                  />
                </div>
                <div className="btn-row">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={readOnly}
                    onClick={() => setField(`${base}.performedAt`, serverNowIso())}
                  >
                    {getString(content, `${base}.performedAt`)
                      ? `מועד הביצוע: ${new Date(getString(content, `${base}.performedAt`)).toLocaleString('he-IL')}`
                      : 'סימון מועד הביצוע (עכשיו)'}
                  </button>
                </div>
                {errors.get(`${base}.performedAt`) ? (
                  <div className="field-error" role="alert">
                    {errors.get(`${base}.performedAt`)}
                  </div>
                ) : null}
              </div>
            );
          })}

          <button
            type="button"
            className="btn btn-block"
            disabled={readOnly}
            onClick={() =>
              appendTo('fumigation.sealingActions', {
                description: '',
                locationDescription: '',
                performedAt: serverNowIso(),
              })
            }
          >
            + הוספת פעולת איטום
          </button>

          <div className="btn-row" style={{ marginTop: '0.6rem' }}>
            <button
              type="button"
              className="btn btn-sm"
              disabled={readOnly}
              onClick={() => setField('fumigation.sealingCompletedAt', serverNowIso())}
            >
              {getString(content, 'fumigation.sealingCompletedAt')
                ? `סיום האיטום: ${new Date(getString(content, 'fumigation.sealingCompletedAt')).toLocaleString('he-IL')}`
                : 'סימון מועד סיום פעולות האיטום'}
            </button>
          </div>
          {errors.get('fumigation.sealingCompletedAt') ? (
            <div className="field-error" role="alert">
              {errors.get('fumigation.sealingCompletedAt')}
            </div>
          ) : null}
        </section>
      ) : null}

      {/* ── סעיף 11 ── */}
      {treatmentKinds.includes('fogging') ? (
        <section className="card" aria-labelledby="step4-fogging">
          <h2 id="step4-fogging">
            ערפול — התראה לציבור<span className="req-ref">סעיף 11</span>
          </h2>

          {errors.get('fogging') ? (
            <div className="field-error" role="alert">
              {errors.get('fogging')}
            </div>
          ) : null}

          <CheckboxField
            path="fogging.publicWarningGiven"
            label="ניתנה לציבור התראה מראש"
            checked={getBoolean(content, 'fogging.publicWarningGiven')}
            disabled={readOnly}
            onChange={(checked) => setField('fogging.publicWarningGiven', checked)}
            error={errors.get('fogging.publicWarningGiven')}
          />

          {getBoolean(content, 'fogging.publicWarningGiven') ? (
            <>
              <TextAreaField
                path="fogging.publicWarningMethod"
                label="אופן ההתראה לציבור"
                required
                disabled={readOnly}
                value={getString(content, 'fogging.publicWarningMethod')}
                onChange={(value) => setField('fogging.publicWarningMethod', value)}
                error={errors.get('fogging.publicWarningMethod')}
                placeholder="לדוגמה: הודעה בלוחות המודעות ובאתר הרשות המקומית, 48 שעות מראש"
              />
              <div className="btn-row">
                <button
                  type="button"
                  className="btn btn-sm"
                  disabled={readOnly}
                  onClick={() => setField('fogging.publicWarningAt', serverNowIso())}
                >
                  {getString(content, 'fogging.publicWarningAt')
                    ? `מועד ההתראה: ${new Date(getString(content, 'fogging.publicWarningAt')).toLocaleString('he-IL')}`
                    : 'סימון מועד ההתראה (עכשיו)'}
                </button>
              </div>
              {errors.get('fogging.publicWarningAt') ? (
                <div className="field-error" role="alert">
                  {errors.get('fogging.publicWarningAt')}
                </div>
              ) : null}
            </>
          ) : (
            <TextAreaField
              path="fogging.publicWarningNotGivenReason"
              label="הסיבה לאי-מתן התראה לציבור"
              required
              disabled={readOnly}
              value={getString(content, 'fogging.publicWarningNotGivenReason')}
              onChange={(value) => setField('fogging.publicWarningNotGivenReason', value)}
              error={errors.get('fogging.publicWarningNotGivenReason')}
            />
          )}
        </section>
      ) : null}

      {/* ── סעיף 12 ── */}
      <section className="card" aria-labelledby="step4-applications">
        <h2 id="step4-applications">
          תכשירים ויישום<span className="req-ref">סעיף 12</span>
        </h2>
        <p className="card-sub">לכל תכשיר: המזיק, השם המסחרי, האצווה, החומר הפעיל, הריכוזים, המינון, הכמות ושיטת היישום.</p>

        {applications.length === 0 ? (
          <EmptyState>
            טרם נרשמו יישומי תכשיר.
            {errors.get('applications') ? (
              <div className="field-error" role="alert">
                {errors.get('applications')}
              </div>
            ) : null}
          </EmptyState>
        ) : null}

        {applications.map((_, index) => {
          const base = `applications.${index}`;
          const readyToUse = getBoolean(content, `${base}.readyToUse`);
          const productId = getString(content, `${base}.productId`);
          const product = reference.products.find((p) => p.id === productId);
          const warnings = product ? productWarnings(product, now) : [];

          return (
            <div className="repeat-item" key={base}>
              <div className="repeat-item-head">
                <h4>תכשיר {index + 1}</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={readOnly}
                  onClick={() => removeAt(base)}
                  aria-label={`הסרת תכשיר ${index + 1}`}
                >
                  הסרה
                </button>
              </div>

              {warnings.map((warning) => (
                <Alert key={warning.message} kind={warning.severity === 'blocking' ? 'error' : 'warning'}>
                  {warning.message}
                </Alert>
              ))}

              <ComboField
                path={`${base}.targetPestName`}
                label="שם המזיק"
                required
                disabled={readOnly}
                value={getString(content, `${base}.targetPestName`)}
                onChange={(value) => setField(`${base}.targetPestName`, value)}
                error={errors.get(`${base}.targetPestName`)}
                options={monitoredPests.map((pest) => ({ value: pest, label: pest }))}
                hint="המזיק חייב להופיע גם בממצאי הניטור (שלב 3)."
              />

              <ComboField
                path={`${base}.productTradeName`}
                label="השם המסחרי של התכשיר"
                required
                disabled={readOnly}
                value={getString(content, `${base}.productTradeName`)}
                onChange={(value) => setField(`${base}.productTradeName`, value)}
                error={errors.get(`${base}.productTradeName`)}
                options={productOptions}
                onSelectOption={(option) => {
                  const selected = reference.products.find((p) => p.id === option.value);
                  if (!selected) return;
                  setFields([
                    { path: `${base}.productTradeName`, value: selected.tradeName },
                    { path: `${base}.productId`, value: selected.id },
                    { path: `${base}.activeIngredientName`, value: selected.activeIngredientName },
                    {
                      path: `${base}.activeIngredientConcentrationPercent`,
                      value: selected.activeIngredientConcentrationPercent,
                    },
                    { path: `${base}.readyToUse`, value: selected.readyToUse },
                    {
                      path: `${base}.productSnapshot`,
                      value: {
                        registrationStatus: selected.registrationStatus,
                        registrationNumber: selected.registrationNumber ?? undefined,
                        labelUrl: selected.labelUrl ?? undefined,
                        sourceName: selected.sourceName,
                        verifiedAt: selected.verifiedAt,
                      },
                    },
                  ]);
                }}
              />

              <div className="field-row">
                <TextField
                  path={`${base}.batchNumber`}
                  label="מספר אצווה / סדרת ייצור"
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.batchNumber`)}
                  onChange={(value) => setField(`${base}.batchNumber`, value)}
                  error={errors.get(`${base}.batchNumber`)}
                  hint="מופיע על אריזת התכשיר. משתנה בין אריזות."
                />
                <TextField
                  path={`${base}.activeIngredientName`}
                  label="שם החומר הפעיל"
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.activeIngredientName`)}
                  onChange={(value) => setField(`${base}.activeIngredientName`, value)}
                  error={errors.get(`${base}.activeIngredientName`)}
                />
              </div>

              <div className="field-row">
                <TextField
                  path={`${base}.activeIngredientConcentrationPercent`}
                  label="ריכוז החומר הפעיל בתכשיר (%)"
                  required
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  disabled={readOnly}
                  value={getString(content, `${base}.activeIngredientConcentrationPercent`)}
                  onChange={(value) => setField(`${base}.activeIngredientConcentrationPercent`, value)}
                  error={errors.get(`${base}.activeIngredientConcentrationPercent`)}
                />
                <CheckboxField
                  path={`${base}.readyToUse`}
                  label="תכשיר מוכן לשימוש"
                  checked={readyToUse}
                  disabled={readOnly}
                  onChange={(checked) => setField(`${base}.readyToUse`, checked)}
                  hint="בתכשיר מוכן לשימוש ניתן לדלג על שדה הריכוז במוכן לשימוש — הוא ייגזר מהריכוז בתכשיר."
                />
              </div>

              <div className="field-row">
                <TextField
                  path={`${base}.dosage`}
                  label="מינון"
                  required
                  type="number"
                  inputMode="decimal"
                  step="0.0001"
                  disabled={readOnly}
                  value={getString(content, `${base}.dosage`)}
                  onChange={(value) => setField(`${base}.dosage`, value)}
                  error={errors.get(`${base}.dosage`)}
                />
                <ComboField
                  path={`${base}.dosageUnit`}
                  label="יחידת המידה"
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.dosageUnit`)}
                  onChange={(value) => setField(`${base}.dosageUnit`, value)}
                  error={errors.get(`${base}.dosageUnit`)}
                  options={DOSAGE_UNIT_SUGGESTIONS.map((unit) => ({ value: unit, label: unit }))}
                />
              </div>

              <fieldset>
                <legend>כמות תמיסה / תערובת / מלכודות ליחידת אורך, שטח או נפח</legend>
                <div className="field-row-3">
                  <SelectField
                    path={`${base}.mixtureKind`}
                    label="סוג הכמות"
                    required
                    disabled={readOnly}
                    value={getString(content, `${base}.mixtureKind`) || 'solution'}
                    onChange={(value) => setField(`${base}.mixtureKind`, value)}
                    error={errors.get(`${base}.mixtureKind`)}
                    options={(Object.keys(MIXTURE_KIND_LABELS) as MixtureKind[]).map((kind) => ({
                      value: kind,
                      label: MIXTURE_KIND_LABELS[kind],
                    }))}
                  />
                  <TextField
                    path={`${base}.mixtureQuantity`}
                    label="כמות"
                    required
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    disabled={readOnly}
                    value={getString(content, `${base}.mixtureQuantity`)}
                    onChange={(value) => setField(`${base}.mixtureQuantity`, value)}
                    error={errors.get(`${base}.mixtureQuantity`)}
                  />
                  <ComboField
                    path={`${base}.mixtureUnit`}
                    label="יחידת הכמות"
                    required
                    disabled={readOnly}
                    value={getString(content, `${base}.mixtureUnit`)}
                    onChange={(value) => setField(`${base}.mixtureUnit`, value)}
                    error={errors.get(`${base}.mixtureUnit`)}
                    options={MIXTURE_UNIT_SUGGESTIONS.map((unit) => ({ value: unit, label: unit }))}
                  />
                </div>
                <div className="field-row-3">
                  <SelectField
                    path={`${base}.quantityBasis`}
                    label="הבסיס"
                    required
                    disabled={readOnly}
                    value={getString(content, `${base}.quantityBasis`) || 'area'}
                    onChange={(value) => setField(`${base}.quantityBasis`, value)}
                    error={errors.get(`${base}.quantityBasis`)}
                    options={(Object.keys(QUANTITY_BASIS_LABELS) as QuantityBasis[]).map((basis) => ({
                      value: basis,
                      label: QUANTITY_BASIS_LABELS[basis],
                    }))}
                  />
                  <TextField
                    path={`${base}.basisAmount`}
                    label="גודל"
                    required
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    disabled={readOnly}
                    value={getString(content, `${base}.basisAmount`)}
                    onChange={(value) => setField(`${base}.basisAmount`, value)}
                    error={errors.get(`${base}.basisAmount`)}
                  />
                  <ComboField
                    path={`${base}.basisUnit`}
                    label="יחידת הבסיס"
                    required
                    disabled={readOnly}
                    value={getString(content, `${base}.basisUnit`)}
                    onChange={(value) => setField(`${base}.basisUnit`, value)}
                    error={errors.get(`${base}.basisUnit`)}
                    options={BASIS_UNIT_SUGGESTIONS.map((unit) => ({ value: unit, label: unit }))}
                  />
                </div>
              </fieldset>

              <TextField
                path={`${base}.readyToUseConcentrationPercent`}
                label="ריכוז החומר הפעיל בתכשיר המוכן לשימוש (%)"
                required={!readyToUse}
                type="number"
                inputMode="decimal"
                step="0.0001"
                disabled={readOnly}
                value={getString(content, `${base}.readyToUseConcentrationPercent`)}
                onChange={(value) => setField(`${base}.readyToUseConcentrationPercent`, value)}
                error={errors.get(`${base}.readyToUseConcentrationPercent`)}
                hint={
                  readyToUse
                    ? 'תכשיר מוכן לשימוש: אם השדה יישאר ריק, הריכוז ייגזר אוטומטית מהריכוז בתכשיר ויסומן ככזה ב-PDF.'
                    : 'הריכוז בתמיסה/בתערובת המוכנה ליישום.'
                }
              />

              <ComboField
                path={`${base}.applicationMethod`}
                label="שיטת היישום"
                required
                disabled={readOnly}
                value={getString(content, `${base}.applicationMethod`)}
                onChange={(value) => setField(`${base}.applicationMethod`, value)}
                error={errors.get(`${base}.applicationMethod`)}
                options={APPLICATION_METHOD_SUGGESTIONS.map((method) => ({ value: method, label: method }))}
              />
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-block"
          disabled={readOnly}
          onClick={() =>
            appendTo('applications', {
              key: `app-${newUuid().slice(0, 8)}`,
              targetPestName: monitoredPests[0] ?? '',
              productTradeName: '',
              batchNumber: '',
              activeIngredientName: '',
              mixtureKind: 'solution',
              quantityBasis: 'area',
              readyToUse: false,
              readyToUseConcentrationDerived: false,
            })
          }
        >
          + הוספת תכשיר
        </button>
      </section>

      {/* ── תחנות האכלה ── */}
      <section className="card" aria-labelledby="step4-bait">
        <h2 id="step4-bait">תחנות האכלה</h2>
        <p className="card-sub">תיעוד מצב התחנות בביקור זה.</p>

        {baitStations.map((_, index) => {
          const base = `baitStations.${index}`;
          return (
            <div className="repeat-item" key={base}>
              <div className="repeat-item-head">
                <h4>תחנה {index + 1}</h4>
                <button
                  type="button"
                  className="btn btn-sm btn-danger"
                  disabled={readOnly}
                  onClick={() => removeAt(base)}
                >
                  הסרה
                </button>
              </div>
              <div className="field-row">
                <TextField
                  path={`${base}.stationNumber`}
                  label="מספר תחנה"
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.stationNumber`)}
                  onChange={(value) => setField(`${base}.stationNumber`, value)}
                  error={errors.get(`${base}.stationNumber`)}
                />
                <SelectField
                  path={`${base}.status`}
                  label="מצב התחנה"
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.status`) || 'intact'}
                  onChange={(value) => setField(`${base}.status`, value)}
                  error={errors.get(`${base}.status`)}
                  options={Object.entries(BAIT_STATION_STATUS_LABELS).map(([value, label]) => ({ value, label }))}
                />
              </div>
              <TextField
                path={`${base}.locationDescription`}
                label="מיקום התחנה"
                required
                disabled={readOnly}
                value={getString(content, `${base}.locationDescription`)}
                onChange={(value) => setField(`${base}.locationDescription`, value)}
                error={errors.get(`${base}.locationDescription`)}
              />
              <div className="field-row">
                <SelectField
                  path={`${base}.consumptionLevel`}
                  label="רמת אכילה"
                  disabled={readOnly}
                  value={getString(content, `${base}.consumptionLevel`)}
                  onChange={(value) => setField(`${base}.consumptionLevel`, value)}
                  options={[
                    { value: 'none', label: 'ללא' },
                    { value: 'partial', label: 'חלקית' },
                    { value: 'full', label: 'מלאה' },
                  ]}
                />
                <TextField
                  path={`${base}.productTradeName`}
                  label="תכשיר בתחנה"
                  disabled={readOnly}
                  value={getString(content, `${base}.productTradeName`)}
                  onChange={(value) => setField(`${base}.productTradeName`, value)}
                />
              </div>
            </div>
          );
        })}

        <button
          type="button"
          className="btn btn-block"
          disabled={readOnly}
          onClick={() => appendTo('baitStations', { stationNumber: '', locationDescription: '', status: 'intact' })}
        >
          + הוספת תחנה
        </button>
      </section>
    </>
  );
}
