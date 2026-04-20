-- Manual migration: Drop orphaned categories table
-- 
-- Context: The categories table was left behind after the category API was
-- removed from the backend. No entity, repository, or controller references
-- this table. This script removes it.
--
-- This script is idempotent and safe to run multiple times.
-- It was applied to the development database on 2026-04-20.
--
-- To apply to another environment, connect to the target PostgreSQL database
-- and run:
--   psql -h <host> -U <user> -d <database> -f drop_categories.sql
--
-- To verify the table has been removed, run:
--   SELECT table_name FROM information_schema.tables
--   WHERE table_schema = 'public' AND table_name = 'categories';
--   (Should return 0 rows)

DROP TABLE IF EXISTS categories;
