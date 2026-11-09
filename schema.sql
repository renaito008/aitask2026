-- Reference schema only. Existing rooms is preserved; no destructive migration.
CREATE TABLE IF NOT EXISTS rooms (
  id TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  edit_hash TEXT NOT NULL UNIQUE,
  view_hash TEXT NOT NULL UNIQUE
);
