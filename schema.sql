CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invites (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  token        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,           -- ex: "Família Souza"
  phone        TEXT,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | declined
  message      TEXT,                    -- recado do convidado aos noivos
  responded_at TEXT,
  opened_at    TEXT,
  open_count   INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS members (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  invite_id INTEGER NOT NULL REFERENCES invites(id) ON DELETE CASCADE,
  name      TEXT NOT NULL,
  attending INTEGER,                    -- NULL = sem resposta, 1 = vai, 0 = não vai
  position  INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_members_invite ON members(invite_id);
