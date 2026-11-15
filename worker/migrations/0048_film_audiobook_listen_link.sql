-- The audiobook's private listening page link (listen.html?l=TOKEN): one per audiobook order, made the
-- first time it's delivered and kept, so a podcast app that follows its feed keeps working. 64 random
-- hex characters; streaming isn't counted, downloads use download_uses_left (Deliver Again resets it).
ALTER TABLE film_keepsake_orders ADD COLUMN listen_token TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_film_keepsake_listen_token ON film_keepsake_orders(listen_token) WHERE listen_token IS NOT NULL;
