-- The audiobook MP3 (one per film, uploaded from admin like the demo and final videos).
ALTER TABLE film_projects ADD COLUMN audiobook_key TEXT;
ALTER TABLE film_projects ADD COLUMN audiobook_uploaded_at TEXT;
-- Keepsake orders get their own line in admin: where each one stands, tracking and notes.
-- status: paid, in_progress, proof_sent, approved, printing, shipped, delivered (KEEPSAKE_STATUSES).
ALTER TABLE film_keepsake_orders ADD COLUMN tracking TEXT;
ALTER TABLE film_keepsake_orders ADD COLUMN staff_notes TEXT;
ALTER TABLE film_keepsake_orders ADD COLUMN status_at TEXT;
ALTER TABLE film_keepsake_orders ADD COLUMN shipped_at TEXT;
ALTER TABLE film_keepsake_orders ADD COLUMN delivered_at TEXT;
-- The audiobook's emailed download link (like FMG's pattern downloads): a long random token,
-- stored only as a SHA-256 hash, that works for a limited time and number of downloads.
ALTER TABLE film_keepsake_orders ADD COLUMN download_hash TEXT;
ALTER TABLE film_keepsake_orders ADD COLUMN download_expires_at TEXT;
ALTER TABLE film_keepsake_orders ADD COLUMN download_uses_left INTEGER;
