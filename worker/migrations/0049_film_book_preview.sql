-- Folder to Film: the book preview (the customer's own book laid out before they buy it).
-- Staff upload make_book.py --web-preview's pictures from admin; they live in R2 at
-- deliverables/<id>/book-preview/ (cover.jpg, spread-001.jpg, ...).
ALTER TABLE film_projects ADD COLUMN book_preview_spreads INTEGER;
ALTER TABLE film_projects ADD COLUMN book_preview_pages INTEGER;
ALTER TABLE film_projects ADD COLUMN book_preview_at TEXT;
