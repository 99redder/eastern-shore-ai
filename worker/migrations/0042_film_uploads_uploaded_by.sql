-- Who added each Folder to Film upload (the buyer, a person they added, or Chris from the staff view),
-- shown on the dashboard and in admin. Older rows stay NULL.
ALTER TABLE film_uploads ADD COLUMN uploaded_by TEXT;
