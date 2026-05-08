# WEGO ERP V1.0

Enterprise ERP boilerplate built with Next.js App Router, TypeScript, and
Tailwind CSS.

## Current scope

- Shared sidebar layout for Finance and Operations portals.
- Dashboard with dummy income, expense, cashflow, and invoice metrics.
- Finance portal routes for income, expenses, and cashflow.
- Operations portal routes for kanban tasks, inventory, and time attendance.
- Mock polymorphic finance data using `Source_Type` and `Source_ID` so every
  ledger/cashflow transaction is tied to an origin document.
- Initial `/finance/income` invoice form boilerplate.

## Getting Started

Install dependencies and run the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Scripts

- `npm run dev` - start the local development server.
- `npm run build` - create a production build.
- `npm run start` - run the production server.
- `npm run lint` - run ESLint.

## Important paths

- `/` - executive dashboard.
- `/finance` - finance portal overview.
- `/finance/income` - income document invoice form.
- `/ops` - operations portal overview.

## Mock data model

Mock financial data lives in `src/lib/mock-data.ts` with shared types in
`src/lib/erp-types.ts`. Financial transactions intentionally persist both:

- `Source_Type` - the origin document type, such as `INVOICE` or `Z_REPORT`.
- `Source_ID` - the origin document identifier.

This keeps cashflow and ledger records traceable as the backend evolves from
mock JSON into a real database.
