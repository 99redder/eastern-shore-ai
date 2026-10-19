-- Website Care Plan: mark a client as the owner's own test. Its payments post as
-- Owner Contributions (tax_income.is_owner_funded = 1), not Website Services revenue.
ALTER TABLE website_clients ADD COLUMN is_owner_test INTEGER NOT NULL DEFAULT 0;
