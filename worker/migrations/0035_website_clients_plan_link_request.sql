-- Website Care Plan: "Manage my website plan" lookup throttle (one emailed link per client per 10 minutes).
ALTER TABLE website_clients ADD COLUMN plan_link_requested_at TEXT;
