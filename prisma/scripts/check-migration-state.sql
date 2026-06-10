SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = '_prisma_migrations'
) AS has_prisma_migrations;

SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'FinancialDocument'
  AND column_name = 'sentToCpaEmail';

SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'AccountantEmailLog'
) AS has_accountant_email_log;
