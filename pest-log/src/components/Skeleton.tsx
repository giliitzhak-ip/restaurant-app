/** שלד טעינה קצר, במקום spinner גדול. */
export function SkeletonList({ rows = 3 }: { rows?: number }): React.JSX.Element {
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="visually-hidden">טוען…</span>
      {Array.from({ length: rows }, (_, index) => (
        <div className="skeleton skeleton-card" key={index} />
      ))}
    </div>
  );
}
