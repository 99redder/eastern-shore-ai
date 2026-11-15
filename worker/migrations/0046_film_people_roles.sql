-- What each person the buyer adds may do: helper (add photos and chat, the default),
-- editor (also change the details, answers and notes), keepsakes (order keepsakes only).
ALTER TABLE film_people ADD COLUMN role TEXT NOT NULL DEFAULT 'helper';
-- Who placed a keepsake order (the buyer's email, an added person's, or 'staff').
ALTER TABLE film_keepsake_orders ADD COLUMN ordered_by TEXT;
-- Who uploaded a file, by email, so helpers can remove their own files and no one else's.
ALTER TABLE film_uploads ADD COLUMN uploader_email TEXT;
