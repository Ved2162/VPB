-- Backward-compatible epoch for revoking signed cookies without storing tokens.
-- Existing signed sessions remain valid at epoch zero until logout or credential change.
ALTER TABLE users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0 CHECK (session_version >= 0);
