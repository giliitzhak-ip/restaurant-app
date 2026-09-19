import { CheckboxField, ComboField, SelectField, TextAreaField, TextField } from '@/components/Fields';
import { SignaturePad } from '@/components/SignaturePad';
import { EmptyState } from '@/components/Common';
import { HANDOVER_METHOD_LABELS, LICENSE_TYPE_SUGGESTIONS, type HandoverMethod } from '@/schema/enums';
import { getArray, getAtPath, getBoolean, getString } from '@/lib/paths';
import { serverNowIso } from '@/lib/time';
import type { SignatureValue } from '@/schema/primitives';
import type { StepProps } from './stepProps';

/**
 * שלב 6 — מדביר מסייע (סעיף 9), מסירת היומן (סעיף 14) וחתימות (סעיף 15).
 */
export function Step6Handover({ draft, errors }: StepProps): React.JSX.Element {
  const { content, setField, setFields, removeAt, appendTo, readOnly } = draft;
  const hasAssistant = getBoolean(content, 'hasAssistant');
  const assistants = getArray(content, 'assistants');
  const handoverMethod = getString(content, 'handover.method');
  const recipientName = getString(content, 'handover.recipientName');

  return (
    <>
      {/* ── סעיף 9 ── */}
      <section className="card" aria-labelledby="step6-assistant">
        <h2 id="step6-assistant">
          מדביר מסייע<span className="req-ref">סעיף 9</span>
        </h2>

        <CheckboxField
          path="hasAssistant"
          label="עבד מדביר מסייע"
          checked={hasAssistant}
          disabled={readOnly}
          onChange={(checked) => {
            setField('hasAssistant', checked);
            if (!checked) setField('assistants', []);
          }}
          error={errors.get('hasAssistant')}
        />

        {hasAssistant ? (
          <>
            {assistants.length === 0 ? (
              <EmptyState>
                יש להוסיף את פרטי המדביר המסייע.
                {errors.get('assistants') ? (
                  <div className="field-error" role="alert">
                    {errors.get('assistants')}
                  </div>
                ) : null}
              </EmptyState>
            ) : null}

            {assistants.map((_, index) => {
              const base = `assistants.${index}`;
              return (
                <div className="repeat-item" key={base}>
                  <div className="repeat-item-head">
                    <h4>מדביר מסייע {index + 1}</h4>
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
                    path={`${base}.fullName`}
                    label="שם מלא"
                    required
                    disabled={readOnly}
                    value={getString(content, `${base}.fullName`)}
                    onChange={(value) => setField(`${base}.fullName`, value)}
                    error={errors.get(`${base}.fullName`)}
                  />

                  <div className="field-row">
                    <ComboField
                      path={`${base}.licenseType`}
                      label="סוג רישיון"
                      required
                      disabled={readOnly}
                      value={getString(content, `${base}.licenseType`)}
                      onChange={(value) => setField(`${base}.licenseType`, value)}
                      error={errors.get(`${base}.licenseType`)}
                      options={LICENSE_TYPE_SUGGESTIONS.map((type) => ({ value: type, label: type }))}
                    />
                    <TextField
                      path={`${base}.licenseNumber`}
                      label="מספר רישיון"
                      required
                      disabled={readOnly}
                      value={getString(content, `${base}.licenseNumber`)}
                      onChange={(value) => setField(`${base}.licenseNumber`, value)}
                      error={errors.get(`${base}.licenseNumber`)}
                    />
                  </div>

                  <div className="field-row">
                    <TextField
                      path={`${base}.phone`}
                      label="טלפון"
                      required
                      type="tel"
                      inputMode="tel"
                      disabled={readOnly}
                      value={getString(content, `${base}.phone`)}
                      onChange={(value) => setField(`${base}.phone`, value)}
                      error={errors.get(`${base}.phone`)}
                    />
                    <TextField
                      path={`${base}.email`}
                      label="דוא״ל"
                      required
                      type="email"
                      inputMode="email"
                      disabled={readOnly}
                      value={getString(content, `${base}.email`)}
                      onChange={(value) => setField(`${base}.email`, value)}
                      error={errors.get(`${base}.email`)}
                    />
                  </div>

                  <TextField
                    path={`${base}.address`}
                    label="כתובת"
                    required
                    disabled={readOnly}
                    value={getString(content, `${base}.address`)}
                    onChange={(value) => setField(`${base}.address`, value)}
                    error={errors.get(`${base}.address`)}
                  />

                  <CheckboxField
                    path={`${base}.instructionsGiven`}
                    label="ניתנו למדביר המסייע הנחיות"
                    checked={getBoolean(content, `${base}.instructionsGiven`)}
                    disabled={readOnly}
                    onChange={(checked) => setField(`${base}.instructionsGiven`, checked)}
                    error={errors.get(`${base}.instructionsGiven`)}
                  />

                  <TextAreaField
                    path={`${base}.instructionsDetails`}
                    label="פירוט ההנחיות שניתנו"
                    disabled={readOnly}
                    value={getString(content, `${base}.instructionsDetails`)}
                    onChange={(value) => setField(`${base}.instructionsDetails`, value)}
                  />

                  <CheckboxField
                    path={`${base}.receivedLogCopy`}
                    label="קיבל עותק מהיומן"
                    checked={getBoolean(content, `${base}.receivedLogCopy`)}
                    disabled={readOnly}
                    onChange={(checked) =>
                      setFields([
                        { path: `${base}.receivedLogCopy`, value: checked },
                        { path: `${base}.receivedLogCopyAt`, value: checked ? serverNowIso() : '' },
                      ])
                    }
                    error={errors.get(`${base}.receivedLogCopy`)}
                  />

                  <SignaturePad
                    path={`${base}.signature`}
                    label="חתימת המדביר המסייע"
                    signerName={
                      getString(content, `${base}.signature.signerName`) || getString(content, `${base}.fullName`)
                    }
                    onSignerNameChange={(name) => setField(`${base}.signature.signerName`, name)}
                    value={getAtPath(content, `${base}.signature`) as Partial<SignatureValue> | undefined}
                    onChange={(value) => setField(`${base}.signature`, value)}
                    error={errors.get(`${base}.signature`)}
                    disabled={readOnly}
                  />
                </div>
              );
            })}

            <button
              type="button"
              className="btn btn-block"
              disabled={readOnly}
              onClick={() =>
                appendTo('assistants', {
                  fullName: '',
                  licenseType: '',
                  licenseNumber: '',
                  phone: '',
                  email: '',
                  address: '',
                  instructionsGiven: false,
                  receivedLogCopy: false,
                })
              }
            >
              + הוספת מדביר מסייע
            </button>
          </>
        ) : null}
      </section>

      {/* ── סעיף 14 ── */}
      <section className="card" aria-labelledby="step6-handover">
        <h2 id="step6-handover">
          מסירת היומן למזמין ההדברה<span className="req-ref">סעיף 14</span>
        </h2>

        <CheckboxField
          path="handover.delivered"
          label="היומן נמסר או הושאר אצל מזמין ההדברה"
          checked={getBoolean(content, 'handover.delivered')}
          disabled={readOnly}
          onChange={(checked) =>
            setFields([
              { path: 'handover.delivered', value: checked },
              { path: 'handover.deliveredAt', value: checked ? serverNowIso() : '' },
            ])
          }
          error={errors.get('handover.delivered')}
        />

        <div className="field-row">
          <TextField
            path="handover.recipientName"
            label="שם האדם שקיבל את היומן"
            required
            disabled={readOnly}
            value={recipientName}
            onChange={(value) => setField('handover.recipientName', value)}
            error={errors.get('handover.recipientName')}
          />
          <TextField
            path="handover.recipientRole"
            label="תפקיד המקבל"
            disabled={readOnly}
            value={getString(content, 'handover.recipientRole')}
            onChange={(value) => setField('handover.recipientRole', value)}
          />
        </div>

        <SelectField
          path="handover.method"
          label="דרך המסירה"
          required
          disabled={readOnly}
          value={handoverMethod}
          onChange={(value) => setField('handover.method', value)}
          error={errors.get('handover.method')}
          options={(Object.keys(HANDOVER_METHOD_LABELS) as HandoverMethod[]).map((method) => ({
            value: method,
            label: HANDOVER_METHOD_LABELS[method],
          }))}
        />

        {handoverMethod === 'other' ? (
          <TextField
            path="handover.methodOther"
            label="פירוט דרך המסירה"
            required
            disabled={readOnly}
            value={getString(content, 'handover.methodOther')}
            onChange={(value) => setField('handover.methodOther', value)}
            error={errors.get('handover.methodOther')}
          />
        ) : null}

        <div className="field">
          <span className="field-label">מועד המסירה</span>
          <div className="row">
            <span className="muted small">
              {getString(content, 'handover.deliveredAt')
                ? new Date(getString(content, 'handover.deliveredAt')).toLocaleString('he-IL')
                : 'טרם נרשם'}
            </span>
            <button
              type="button"
              className="btn btn-sm"
              disabled={readOnly}
              onClick={() => setField('handover.deliveredAt', serverNowIso())}
            >
              עדכון למועד הנוכחי
            </button>
          </div>
          {errors.get('handover.deliveredAt') ? (
            <div className="field-error" role="alert">
              {errors.get('handover.deliveredAt')}
            </div>
          ) : null}
        </div>
      </section>

      {/* ── סעיף 15 ── */}
      <section className="card" aria-labelledby="step6-signatures">
        <h2 id="step6-signatures">
          חתימות<span className="req-ref">סעיף 15</span>
        </h2>

        <SignaturePad
          path="signatures.exterminator"
          label="חתימת המדביר"
          signerName={
            getString(content, 'signatures.exterminator.signerName') || getString(content, 'exterminator.fullName')
          }
          onSignerNameChange={(name) => setField('signatures.exterminator.signerName', name)}
          value={getAtPath(content, 'signatures.exterminator') as Partial<SignatureValue> | undefined}
          onChange={(value) => setField('signatures.exterminator', value)}
          error={errors.get('signatures.exterminator')}
          disabled={readOnly}
        />

        <SignaturePad
          path="signatures.recipient"
          label="חתימת האדם שקיבל את היומן"
          signerName={recipientName}
          lockName
          value={getAtPath(content, 'signatures.recipient') as Partial<SignatureValue> | undefined}
          onChange={(value) =>
            setField('signatures.recipient', value ? { ...value, signerName: recipientName } : undefined)
          }
          error={errors.get('signatures.recipient') ?? errors.get('signatures.recipient.signerName')}
          disabled={readOnly}
        />
      </section>
    </>
  );
}
