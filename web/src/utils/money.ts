/** Exact cent-domain arithmetic for the currencies this app supports (all 2 decimals). */
export const toMinorUnits = (amount: number): number => Math.round(amount * 100);
export const fromMinorUnits = (minor: number): number => minor / 100;
