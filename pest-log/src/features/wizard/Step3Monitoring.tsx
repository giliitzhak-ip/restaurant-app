import { ComboField, SelectField, TextAreaField, TextField } from '@/components/Fields';
import { EmptyState } from '@/components/Common';
import { INFESTATION_LEVEL_LABELS, type InfestationLevel } from '@/schema/enums';
import { getArray, getString } from '@/lib/paths';
import { PhotoAttachments } from '@/features/photos/PhotoAttachments';
import { TemplatePicker } from '@/components/TemplatePicker';
import { annexRuleFor } from '@/schema/textLibraries';
import type { StepProps } from './stepProps';

/** שלב 3 — ממצאי ניטור (דרישה 6) ותמונות תיעוד. */
export function Step3Monitoring({ draft, reference, errors, logId, organizationId }: StepProps): React.JSX.Element {
  const { content, setField, removeAt, appendTo, readOnly } = draft;
  const findings = getArray(content, 'monitoring.findings');

  const pestOptions = reference.pestCatalog.map((pest) => ({
    value: pest.code,
    label: pest.nameHe,
    sublabel: [pest.groupName, pest.nameScientific].filter(Boolean).join(' · '),
  }));

  const addFinding = () =>
    appendTo('monitoring.findings', {
      pestName: '',
      identificationActions: '',
      developmentStage: '',
      infestationSigns: '',
      findingLocation: '',
      infestationLevel: 'low',
    });

  return (
    <>
    <section className="card" aria-labelledby="step3-monitoring">
      <h2 id="step3-monitoring">
        ממצאי ניטור<span className="req-ref">סעיף 6</span>
      </h2>
      <p className="card-sub">
        לכל מזיק שנמצא: פעולות הזיהוי, דרגת ההתפתחות, סימני הנגיעות, המיקום ורמת הנגיעות.
      </p>

      {reference.pestCatalog.length === 0 ? (
        <div className="alert alert-warning">
          קטלוג המזיקים (נספח א׳) טרם נטען למערכת. ניתן להזין שם מזיק חופשי, ומומלץ לטעון את הקטלוג
          דרך מסך הייבוא כדי לעבוד מול רשימה מאומתת.
        </div>
      ) : null}

      {findings.length === 0 ? (
        <EmptyState>
          טרם נרשמו ממצאים. יש להוסיף לפחות מזיק אחד שנמצא או שנבדק.
          {errors.get('monitoring.findings') ? (
            <div className="field-error" role="alert">
              {errors.get('monitoring.findings')}
            </div>
          ) : null}
        </EmptyState>
      ) : null}

      {findings.map((_, index) => {
        const base = `monitoring.findings.${index}`;
        return (
          <div className="repeat-item" key={base}>
            <div className="repeat-item-head">
              <h4>מזיק {index + 1}</h4>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                disabled={readOnly}
                onClick={() => removeAt(base)}
                aria-label={`הסרת מזיק ${index + 1}`}
              >
                הסרה
              </button>
            </div>

            <ComboField
              path={`${base}.pestName`}
              label="שם המזיק"
              required
              disabled={readOnly}
              value={getString(content, `${base}.pestName`)}
              onChange={(value) => setField(`${base}.pestName`, value)}
              error={errors.get(`${base}.pestName`)}
              options={pestOptions}
              onSelectOption={(option) => setField(`${base}.pestCatalogCode`, option.value)}
              hint="ניתן לבחור מהקטלוג או להזין שם חופשי."
            />

            {/* נספח א׳: מזיקים מסוימים מחייבים פירוט נוסף. */}
            {(() => {
              const rule = annexRuleFor(getString(content, `${base}.pestName`));
              if (!rule) return null;
              return rule.options ? (
                <SelectField
                  path={`${base}.pestSubtype`}
                  label={rule.label}
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.pestSubtype`)}
                  onChange={(value) => setField(`${base}.pestSubtype`, value)}
                  error={errors.get(`${base}.pestSubtype`)}
                  options={rule.options.map((option) => ({ value: option, label: option }))}
                  placeholder="בחירת פירוט"
                />
              ) : (
                <TextField
                  path={`${base}.pestSubtype`}
                  label={rule.label}
                  required
                  disabled={readOnly}
                  value={getString(content, `${base}.pestSubtype`)}
                  onChange={(value) => setField(`${base}.pestSubtype`, value)}
                  error={errors.get(`${base}.pestSubtype`)}
                  placeholder={rule.hint ?? ''}
                />
              );
            })()}

            <TextAreaField
              path={`${base}.identificationActions`}
              label="פעולות הזיהוי"
              required
              disabled={readOnly}
              value={getString(content, `${base}.identificationActions`)}
              onChange={(value) => setField(`${base}.identificationActions`, value)}
              error={errors.get(`${base}.identificationActions`)}
              placeholder="מה נעשה כדי לזהות את המזיק: בדיקה חזותית, מלכודות ניטור, בדיקה חוזרת…"
            />

            <div className="field-row">
              <TextField
                path={`${base}.developmentStage`}
                label="דרגת התפתחות"
                required
                disabled={readOnly}
                value={getString(content, `${base}.developmentStage`)}
                onChange={(value) => setField(`${base}.developmentStage`, value)}
                error={errors.get(`${base}.developmentStage`)}
                placeholder="לדוגמה: ביצים, נימפות, בוגרים"
              />
              <SelectField
                path={`${base}.infestationLevel`}
                label="רמת נגיעות"
                required
                disabled={readOnly}
                value={getString(content, `${base}.infestationLevel`) || 'low'}
                onChange={(value) => setField(`${base}.infestationLevel`, value)}
                error={errors.get(`${base}.infestationLevel`)}
                options={(Object.keys(INFESTATION_LEVEL_LABELS) as InfestationLevel[]).map((level) => ({
                  value: level,
                  label: INFESTATION_LEVEL_LABELS[level],
                }))}
              />
            </div>

            <TextAreaField
              path={`${base}.infestationSigns`}
              label="סימני נגיעות"
              required
              disabled={readOnly}
              value={getString(content, `${base}.infestationSigns`)}
              onChange={(value) => setField(`${base}.infestationSigns`, value)}
              error={errors.get(`${base}.infestationSigns`)}
              placeholder="הפרשות, שרידי נשל, נזק פיזי, ריח…"
            />
            <TemplatePicker
              kind="finding_signs"
              disabled={readOnly}
              value={getString(content, `${base}.infestationSigns`)}
              onChange={(next) => setField(`${base}.infestationSigns`, next)}
            />

            <TextField
              path={`${base}.findingLocation`}
              label="מיקום הממצא"
              required
              disabled={readOnly}
              value={getString(content, `${base}.findingLocation`)}
              onChange={(value) => setField(`${base}.findingLocation`, value)}
              error={errors.get(`${base}.findingLocation`)}
              placeholder="לדוגמה: מטבח — מתחת לכיור"
            />

            <TextField
              path={`${base}.notes`}
              label="הערות"
              disabled={readOnly}
              value={getString(content, `${base}.notes`)}
              onChange={(value) => setField(`${base}.notes`, value)}
              error={errors.get(`${base}.notes`)}
            />
          </div>
        );
      })}

      <button type="button" className="btn btn-block" onClick={addFinding} disabled={readOnly}>
        + הוספת מזיק
      </button>
    </section>

    <PhotoAttachments draft={draft} logId={logId} organizationId={organizationId} />
    </>
  );
}
