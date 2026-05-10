type CashRow = { inflow: number; outflow: number };

export function withCashRunningBalances<T extends CashRow>(rows: T[], opening: number): (T & { running: number })[] {
  return rows.reduce<{ items: (T & { running: number })[]; balance: number }>(
    (acc, row) => {
      const balance = acc.balance + row.inflow - row.outflow;
      return {
        balance,
        items: [...acc.items, { ...row, running: balance }],
      };
    },
    { items: [], balance: opening },
  ).items;
}

type LedgerRow = { debit: number; credit: number; balance_delta?: number };

export function withLedgerRunningBalances<T extends LedgerRow>(rows: T[], opening: number): (T & { balance: number })[] {
  return rows.reduce<{ items: (T & { balance: number })[]; balance: number }>(
    (acc, row) => {
      const balance = acc.balance + (row.balance_delta ?? row.debit - row.credit);
      return {
        balance,
        items: [...acc.items, { ...row, balance }],
      };
    },
    { items: [], balance: opening },
  ).items;
}
