/** USD cents → "$1.23" (LTR-isolated for Hebrew text). */
export const usd = (cents: number) => `⁦$${(cents / 100).toFixed(2)}⁩`;
