import { ComboField, CheckboxField, TextField } from '@/components/Fields';
import { LICENSE_TYPE_SUGGESTIONS } from '@/schema/enums';
import { getBoolean, getString } from '@/lib/paths';
import type { StepProps } from './stepProps';

/**
 * שלב 1 — פרטי המדביר (דרישה 1), מפעיל המדביר (דרישה 2)
 * ומזמין ההדברה (דרישה 3).
 */
export function Step1Parties({ draft, reference, errors }: StepProps): React.JSX.Element {
  const { content, setField, setFields, readOnly } = draft;
  const hasOperator = getBoolean(content, 'operator.hasOperator');
  const isPrivatePerson = getBoolean(content, 'orderer.isPrivatePerson');

  const clientOptions = reference.clients.map((client) => ({
    value: client.id,
    label: client.name,
    sublabel: [client.contactRole, client.phone].filter(Boolean).join(' · '),
  }));

  return (
    <>
      <section className="card" aria-labelledby="step1-exterminator">
        <h2 id="step1-exterminator">
          פרטי המדביר<span className="req-ref">סעיף 1</span>
        </h2>

        <TextField
          path="exterminator.fullName"
          label="שם מלא"
          required
          disabled={readOnly}
          value={getString(content, 'exterminator.fullName')}
          onChange={(value) => setField('exterminator.fullName', value)}
          error={errors.get('exterminator.fullName')}
          autoComplete="name"
        />

        <div className="field-row">
          <ComboField
            path="exterminator.licenseType"
            label="סוג רישיון"
            required
            disabled={readOnly}
            value={getString(content, 'exterminator.licenseType')}
            onChange={(value) => setField('exterminator.licenseType', value)}
            error={errors.get('exterminator.licenseType')}
            options={LICENSE_TYPE_SUGGESTIONS.map((type) => ({ value: type, label: type }))}
            hint="רשימת ההצעות אינה רשימה סגורה — ניתן להזין את סוג הרישיון כפי שהוא מופיע ברישיון."
          />
          <TextField
            path="exterminator.licenseNumber"
            label="מספר רישיון"
            required
            disabled={readOnly}
            value={getString(content, 'exterminator.licenseNumber')}
            onChange={(value) => setField('exterminator.licenseNumber', value)}
            error={errors.get('exterminator.licenseNumber')}
          />
        </div>

        <div className="field-row">
          <TextField
            path="exterminator.mobile"
            label="טלפון נייד"
            required
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={readOnly}
            value={getString(content, 'exterminator.mobile')}
            onChange={(value) => setField('exterminator.mobile', value)}
            error={errors.get('exterminator.mobile')}
            placeholder="0501234567"
          />
          <TextField
            path="exterminator.email"
            label="דוא״ל"
            required
            type="email"
            inputMode="email"
            autoComplete="email"
            disabled={readOnly}
            value={getString(content, 'exterminator.email')}
            onChange={(value) => setField('exterminator.email', value)}
            error={errors.get('exterminator.email')}
          />
        </div>

        <TextField
          path="exterminator.address"
          label="כתובת"
          required
          disabled={readOnly}
          value={getString(content, 'exterminator.address')}
          onChange={(value) => setField('exterminator.address', value)}
          error={errors.get('exterminator.address')}
          autoComplete="street-address"
        />
      </section>

      <section className="card" aria-labelledby="step1-operator">
        <h2 id="step1-operator">
          פרטי מפעיל המדביר<span className="req-ref">סעיף 2</span>
        </h2>
        <p className="card-sub">ימולא רק אם קיים מפעיל מדביר.</p>

        <CheckboxField
          path="operator.hasOperator"
          label="קיים מפעיל מדביר"
          checked={hasOperator}
          disabled={readOnly}
          onChange={(checked) =>
            checked
              ? setField('operator', { hasOperator: true })
              : setField('operator', { hasOperator: false })
          }
          error={errors.get('operator.hasOperator')}
        />

        {hasOperator ? (
          <>
            <TextField
              path="operator.name"
              label="שם מפעיל המדביר"
              required
              disabled={readOnly}
              value={getString(content, 'operator.name')}
              onChange={(value) => setField('operator.name', value)}
              error={errors.get('operator.name')}
            />
            <div className="field-row">
              <TextField
                path="operator.phone"
                label="טלפון"
                required
                type="tel"
                inputMode="tel"
                disabled={readOnly}
                value={getString(content, 'operator.phone')}
                onChange={(value) => setField('operator.phone', value)}
                error={errors.get('operator.phone')}
              />
              <TextField
                path="operator.email"
                label="דוא״ל"
                required
                type="email"
                inputMode="email"
                disabled={readOnly}
                value={getString(content, 'operator.email')}
                onChange={(value) => setField('operator.email', value)}
                error={errors.get('operator.email')}
              />
            </div>
            <TextField
              path="operator.address"
              label="כתובת"
              required
              disabled={readOnly}
              value={getString(content, 'operator.address')}
              onChange={(value) => setField('operator.address', value)}
              error={errors.get('operator.address')}
            />
          </>
        ) : null}
      </section>

      <section className="card" aria-labelledby="step1-orderer">
        <h2 id="step1-orderer">
          פרטי מזמין ההדברה<span className="req-ref">סעיף 3</span>
        </h2>

        <ComboField
          path="orderer.name"
          label="שם מזמין ההדברה"
          required
          disabled={readOnly}
          value={getString(content, 'orderer.name')}
          onChange={(value) => setField('orderer.name', value)}
          error={errors.get('orderer.name')}
          options={clientOptions}
          hint="בחירה מהרשימה תמלא אוטומטית את שאר פרטי המזמין."
          onSelectOption={(option) => {
            const client = reference.clients.find((c) => c.id === option.value);
            if (!client) return;
            setFields([
              { path: 'orderer.name', value: client.name },
              { path: 'orderer.clientId', value: client.id },
              { path: 'orderer.phone', value: client.phone ?? '' },
              { path: 'orderer.mobile', value: client.mobile ?? '' },
              { path: 'orderer.isPrivatePerson', value: client.isPrivatePerson },
              { path: 'orderer.role', value: client.contactRole ?? '' },
            ]);
          }}
        />

        <CheckboxField
          path="orderer.isPrivatePerson"
          label="המזמין הוא אדם פרטי"
          checked={isPrivatePerson}
          disabled={readOnly}
          onChange={(checked) => setField('orderer.isPrivatePerson', checked)}
          hint="כאשר המזמין אדם פרטי — מספר הנייד הוא שדה חובה."
          error={errors.get('orderer.isPrivatePerson')}
        />

        <div className="field-row">
          <TextField
            path="orderer.phone"
            label="מספר טלפון"
            required
            type="tel"
            inputMode="tel"
            disabled={readOnly}
            value={getString(content, 'orderer.phone')}
            onChange={(value) => setField('orderer.phone', value)}
            error={errors.get('orderer.phone')}
          />
          <TextField
            path="orderer.mobile"
            label="מספר נייד"
            required={isPrivatePerson}
            type="tel"
            inputMode="tel"
            disabled={readOnly}
            value={getString(content, 'orderer.mobile')}
            onChange={(value) => setField('orderer.mobile', value)}
            error={errors.get('orderer.mobile')}
          />
        </div>

        <TextField
          path="orderer.role"
          label="תפקידו"
          required
          disabled={readOnly}
          value={getString(content, 'orderer.role')}
          onChange={(value) => setField('orderer.role', value)}
          error={errors.get('orderer.role')}
          placeholder="לדוגמה: בעל הדירה, יו״ר ועד הבית, מנהל תברואה"
        />
      </section>
    </>
  );
}
