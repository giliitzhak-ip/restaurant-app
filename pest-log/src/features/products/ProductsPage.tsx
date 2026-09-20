import { useMemo, useState } from 'react';
import { useApp } from '@/state/AppContext';
import { Alert, EmptyState, PoisonNotice } from '@/components/Common';
import { PRODUCT_REGISTRATION_STATUS_LABELS } from '@/schema/enums';
import { productWarnings } from '@/schema/product';
import { formatDateHe } from '@/lib/time';
import { serverNow } from '@/lib/time';

/**
 * מאגר התכשירים.
 *
 * לכל תכשיר מוצגים מקור המידע ותאריך האימות, ואזהרה כשהתכשיר אינו בתוקף
 * או שלא אומת לאחרונה. אין להציג את המאגר כמידע רשמי עדכני.
 */
export function ProductsPage(): React.JSX.Element {
  const { reference } = useApp();
  const [query, setQuery] = useState('');
  const now = serverNow();

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return reference.products;
    return reference.products.filter(
      (product) =>
        product.tradeName.toLowerCase().includes(needle) ||
        product.activeIngredientName.toLowerCase().includes(needle) ||
        product.approvedPests.some((pest) => pest.toLowerCase().includes(needle)),
    );
  }, [reference.products, query]);

  return (
    <>
      <PoisonNotice />

      <section className="card">
        <h2>תכשירי הדברה</h2>
        <p className="card-sub">{reference.products.length} תכשירים במאגר העסק.</p>

        <Alert kind="warning" title="המאגר אינו מקור רשמי">
          יש לאמת כל תכשיר מול התווית ומול המקור הרשמי לפני השימוש. טעינת מאגר מאומת מתבצעת דרך
          <span className="mono"> npm run import:products</span>.
        </Alert>

        <div className="field">
          <label htmlFor="products-search">חיפוש</label>
          <input
            id="products-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="שם מסחרי, חומר פעיל או מזיק"
          />
        </div>

        {visible.length === 0 ? (
          <EmptyState>
            {reference.products.length === 0
              ? 'המאגר ריק. יש לטעון תכשירים ממקור מאומת.'
              : 'לא נמצאו תכשירים מתאימים.'}
          </EmptyState>
        ) : null}

        {visible.map((product) => {
          const warnings = productWarnings(product, now);
          return (
            <article className="repeat-item" key={product.id}>
              <div className="repeat-item-head">
                <h4>{product.tradeName}</h4>
                <span
                  className={`tag ${
                    product.registrationStatus === 'registered'
                      ? 'tag-success'
                      : product.registrationStatus === 'unknown'
                        ? 'tag-warning'
                        : 'tag-danger'
                  }`}
                >
                  {PRODUCT_REGISTRATION_STATUS_LABELS[product.registrationStatus]}
                </span>
              </div>

              {warnings.map((warning) => (
                <Alert key={warning.message} kind={warning.severity === 'blocking' ? 'error' : 'warning'}>
                  {warning.message}
                </Alert>
              ))}

              <div className="small">
                <div>
                  <strong>חומר פעיל:</strong> {product.activeIngredientName} ·{' '}
                  {product.activeIngredientConcentrationPercent}%
                </div>
                {product.readyToUse ? <div>תכשיר מוכן לשימוש</div> : null}
                {product.registrationNumber ? <div>מספר רישום: {product.registrationNumber}</div> : null}
                {product.validUntil ? <div>בתוקף עד: {formatDateHe(product.validUntil)}</div> : null}
                {product.approvedPests.length > 0 ? (
                  <div>מזיקים מורשים: {product.approvedPests.join(', ')}</div>
                ) : null}
                {product.approvedApplicationMethods.length > 0 ? (
                  <div>שיטות יישום: {product.approvedApplicationMethods.join(', ')}</div>
                ) : null}
                <div className="dim" style={{ marginTop: '0.3rem' }}>
                  מקור: {product.sourceName} · אומת: {formatDateHe(product.verifiedAt)}
                </div>
                {product.labelUrl ? (
                  <div>
                    <a href={product.labelUrl} target="_blank" rel="noopener noreferrer">
                      קישור לתווית
                    </a>
                  </div>
                ) : null}
              </div>
            </article>
          );
        })}
      </section>
    </>
  );
}
