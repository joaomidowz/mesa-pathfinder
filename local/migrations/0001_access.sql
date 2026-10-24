-- Acesso ao servidor da mesa (só no servidor local; no ChatGPT Sites a plataforma cuidava do login).
-- Guarda apenas hashes: o código de acesso e o token de sessão nunca ficam em claro no banco.
CREATE TABLE local_access (
  email TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE TABLE local_sessions (
  token_hash TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX local_sessions_email_idx ON local_sessions(email);
