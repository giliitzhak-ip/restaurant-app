import { useState } from 'react';
import { CheckboxField, SelectField, TextAreaField, TextField } from '@/components/Fields';
import { Alert } from '@/components/Common';
import { getArray, getAtPath, getBoolean, getString } from '@/lib/paths';
import { serverNowIso } from '@/lib/time';
import type { StepProps } from './stepProps';

/**
 * שלב 5 — אזהרות ומידע לפני ההדברה (סעיף 8) ובמהלכה ובסיומה (סעיף 13).
 *
 * כללים שנאכפים כאן:
 *  - אין מילוי אוטומטי של אזהרות או זמן כניסה. תבנית היא הצעה בלבד:
 *    היא ממלאת את השדות, אך האישור נמחק ועל המדביר לאשר מחדש.
 *  - כשיש כמה תכשירים — האזהרות חייבות להתייחס לכולם, או שיש לסמן
 *    שהוחלה ההנחיה המחמירה ביותר.
 */
export function Step5Warnings({ draft, reference, errors }: StepProps): React.JSX.Element {
  const { content, setField, setFields, readOnly } = draft;
  const [templateId, setTemplateId] = useState('');

  const applications = getArray(content, 'applications');
  const coveredKeys = (getAtPath(content, 'preWarnings.coveredApplicationKeys') as string[] | undefined) ?? [];
  const strictest = getBoolean(content, 'preWarnings.strictestAppliedAcrossAll');
  const followUpRequired = getBoolean(content, 'postWarnings.followUpRequired');

  const applyTemplate = (id: string) => {
    const template = reference.templates.find((t) => t.id === id);
    if (!template) return;
    // התבנית ממלאת טקסט — ומבטלת את האישור. האחריות נשארת על המדביר.
    setFields([
      { path: 'preWarnings.treatmentNatureDescription', value: template.treatmentNatureDescription ?? '' },
      { path: 'preWarnings.risksToHumans', value: template.risksToHumans ?? '' },
      { path: 'preWarnings.risksToAnimals', value: template.risksToAnimals ?? '' },
      { path: 'preWarnings.reEntryHours', value: template.reEntryHours ?? '' },
      { path: 'preWarnings.additionalLabelInstructions', value: template.additionalLabelInstructions ?? '' },
      { path: 'preWarnings.labelReference', value: template.labelReference ?? '' },
      { path: 'preWarnings.sourceTemplateId', value: template.id },
      { path: 'preWarnings.acknowledgedByExterminator', value: false },
      { path: 'preWarnings.acknowledgedAt', value: '' },
      { path: 'postWarnings.duringTreatmentInfo', value: template.duringTreatmentInfo ?? '' },
      { path: 'postWarnings.afterTreatmentInfo', value: template.afterTreatmentInfo ?? '' },
      { path: 'postWarnings.acknowledgedByExterminator', value: false },
      { path: 'postWarnings.acknowledgedAt', value: '' },
    ]);
  };

  const toggleCovered = (key: string) => {
    const next = coveredKeys.includes(key) ? coveredKeys.filter((k) => k !== key) : [...coveredKeys, key];
    setField('preWarnings.coveredApplicationKeys', next);
  };

  return (
    <>
      <section className="card" aria-labelledby="step5-pre">
        <h2 id="step5-pre">
          אזהרות ומידע לפני ההדברה<span className="req-ref">סעיף 8</span>
        </h2>

        <Alert kind="warning" title="האזהרות הן באחריות המדביר">
          תבנית אזהרה היא הצעה בלבד. אין למלא אזהרות או זמן כניסה מחדש שאינם מבוססים על תווית תקפה
          של התכשיר, ועל המדביר לאשר את התוכן במפורש לפני השלמת היומן.
        </Alert>

        {reference.templates.length > 0 ? (
          <div className="field">
            <SelectField
              path="preWarnings.sourceTemplateId"
              label="טעינת תבנית כהצעה"
              disabled={readOnly}
              value={templateId}
              onChange={(value) => {
                setTemplateId(value);
                if (value) applyTemplate(value);
              }}
              options={reference.templates.map((template) => ({ value: template.id, label: template.title }))}
              hint="טעינת תבנית מבטלת את האישור הקיים ומחייבת אישור מחדש."
            />
          </div>
        ) : null}

        <TextAreaField
          path="preWarnings.treatmentNatureDescription"
          label="תיאור מפורט של טיב ההדברה"
          required
          rows={4}
          disabled={readOnly}
          value={getString(content, 'preWarnings.treatmentNatureDescription')}
          onChange={(value) => setField('preWarnings.treatmentNatureDescription', value)}
          error={errors.get('preWarnings.treatmentNatureDescription')}
        />

        <TextAreaField
          path="preWarnings.risksToHumans"
          label="סיכונים לאדם"
          required
          rows={3}
          disabled={readOnly}
          value={getString(content, 'preWarnings.risksToHumans')}
          onChange={(value) => setField('preWarnings.risksToHumans', value)}
          error={errors.get('preWarnings.risksToHumans')}
        />

        <TextAreaField
          path="preWarnings.risksToAnimals"
          label="סיכונים לבעלי חיים"
          required
          rows={3}
          disabled={readOnly}
          value={getString(content, 'preWarnings.risksToAnimals')}
          onChange={(value) => setField('preWarnings.risksToAnimals', value)}
          error={errors.get('preWarnings.risksToAnimals')}
        />

        <div className="field-row">
          <TextField
            path="preWarnings.reEntryHours"
            label="זמן כניסה מחדש (שעות)"
            required
            type="number"
            inputMode="decimal"
            step="0.5"
            disabled={readOnly}
            value={getString(content, 'preWarnings.reEntryHours')}
            onChange={(value) => setField('preWarnings.reEntryHours', value)}
            error={errors.get('preWarnings.reEntryHours')}
            hint="לפי תווית התכשיר בלבד."
          />
          <TextField
            path="preWarnings.labelReference"
            label="אסמכתת תווית התכשיר"
            required
            disabled={readOnly}
            value={getString(content, 'preWarnings.labelReference')}
            onChange={(value) => setField('preWarnings.labelReference', value)}
            error={errors.get('preWarnings.labelReference')}
            placeholder="שם התווית / מהדורה / תאריך"
          />
        </div>

        <TextAreaField
          path="preWarnings.additionalLabelInstructions"
          label="הוראות נוספות לפי תווית התכשיר"
          required
          rows={3}
          disabled={readOnly}
          value={getString(content, 'preWarnings.additionalLabelInstructions')}
          onChange={(value) => setField('preWarnings.additionalLabelInstructions', value)}
          error={errors.get('preWarnings.additionalLabelInstructions')}
        />

        <fieldset>
          <legend>לאילו תכשירים מתייחסות האזהרות</legend>
          {applications.length === 0 ? (
            <p className="muted small">טרם נרשמו תכשירים בשלב 4.</p>
          ) : (
            applications.map((application, index) => {
              const key = getString(application, 'key');
              const name = getString(application, 'productTradeName') || `תכשיר ${index + 1}`;
              return (
                <div className="checkbox-row" key={key || index}>
                  <input
                    id={`covered-${key || index}`}
                    type="checkbox"
                    checked={coveredKeys.includes(key)}
                    disabled={readOnly || strictest}
                    onChange={() => toggleCovered(key)}
                  />
                  <label htmlFor={`covered-${key || index}`}>{name}</label>
                </div>
              );
            })
          )}

          <CheckboxField
            path="preWarnings.strictestAppliedAcrossAll"
            label="הוחלה ההנחיה המחמירה ביותר על כל התכשירים"
            checked={strictest}
            disabled={readOnly}
            onChange={(checked) => setField('preWarnings.strictestAppliedAcrossAll', checked)}
            hint="לסימון כאשר האזהרות אינן מפורטות לכל תכשיר בנפרד."
          />

          {errors.get('preWarnings.coveredApplicationKeys') ? (
            <div className="field-error" role="alert">
              {errors.get('preWarnings.coveredApplicationKeys')}
            </div>
          ) : null}
        </fieldset>

        <CheckboxField
          path="preWarnings.acknowledgedByExterminator"
          label="אני, המדביר, מאשר שהאזהרות שלעיל מבוססות על תווית תקפה של התכשיר ונכונות ליומן זה"
          checked={getBoolean(content, 'preWarnings.acknowledgedByExterminator')}
          disabled={readOnly}
          onChange={(checked) =>
            setFields([
              { path: 'preWarnings.acknowledgedByExterminator', value: checked },
              { path: 'preWarnings.acknowledgedAt', value: checked ? serverNowIso() : '' },
            ])
          }
          error={errors.get('preWarnings.acknowledgedByExterminator')}
        />
      </section>

      <section className="card" aria-labelledby="step5-post">
        <h2 id="step5-post">
          אזהרות ומידע במהלך ההדברה ובסיומה<span className="req-ref">סעיף 13</span>
        </h2>

        <TextAreaField
          path="postWarnings.duringTreatmentInfo"
          label="אזהרות ומידע במהלך ההדברה"
          required
          rows={3}
          disabled={readOnly}
          value={getString(content, 'postWarnings.duringTreatmentInfo')}
          onChange={(value) => setField('postWarnings.duringTreatmentInfo', value)}
          error={errors.get('postWarnings.duringTreatmentInfo')}
        />

        <TextAreaField
          path="postWarnings.afterTreatmentInfo"
          label="אזהרות ומידע בסיום ההדברה"
          required
          rows={3}
          disabled={readOnly}
          value={getString(content, 'postWarnings.afterTreatmentInfo')}
          onChange={(value) => setField('postWarnings.afterTreatmentInfo', value)}
          error={errors.get('postWarnings.afterTreatmentInfo')}
        />

        <CheckboxField
          path="postWarnings.followUpRequired"
          label="נדרש טיפול משלים"
          checked={followUpRequired}
          disabled={readOnly}
          onChange={(checked) => setField('postWarnings.followUpRequired', checked)}
          error={errors.get('postWarnings.followUpRequired')}
        />

        {followUpRequired ? (
          <>
            <TextAreaField
              path="postWarnings.followUpDescription"
              label="תיאור הטיפול המשלים"
              required
              disabled={readOnly}
              value={getString(content, 'postWarnings.followUpDescription')}
              onChange={(value) => setField('postWarnings.followUpDescription', value)}
              error={errors.get('postWarnings.followUpDescription')}
            />
            <TextField
              path="postWarnings.followUpTargetDate"
              label="מועד מתוכנן לטיפול משלים"
              type="date"
              disabled={readOnly}
              value={getString(content, 'postWarnings.followUpTargetDate')}
              onChange={(value) => setField('postWarnings.followUpTargetDate', value)}
              error={errors.get('postWarnings.followUpTargetDate')}
            />
          </>
        ) : null}

        <CheckboxField
          path="postWarnings.acknowledgedByExterminator"
          label="אני, המדביר, מאשר את האזהרות והמידע שנמסרו במהלך ההדברה ובסיומה"
          checked={getBoolean(content, 'postWarnings.acknowledgedByExterminator')}
          disabled={readOnly}
          onChange={(checked) =>
            setFields([
              { path: 'postWarnings.acknowledgedByExterminator', value: checked },
              { path: 'postWarnings.acknowledgedAt', value: checked ? serverNowIso() : '' },
            ])
          }
          error={errors.get('postWarnings.acknowledgedByExterminator')}
        />
      </section>
    </>
  );
}
