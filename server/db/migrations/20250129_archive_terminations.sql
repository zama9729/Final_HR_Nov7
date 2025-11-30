-- Archive termination records and disable feature flag

CREATE TABLE IF NOT EXISTS archived_terminations (
  LIKE terminations INCLUDING ALL
);

ALTER TABLE archived_terminations
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ DEFAULT now();

INSERT INTO archived_terminations
  SELECT *, now() AS archived_at
  FROM terminations
ON CONFLICT (id) DO UPDATE
  SET archived_at = EXCLUDED.archived_at;

CREATE TABLE IF NOT EXISTS feature_flags (
  feature_key TEXT PRIMARY KEY,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  payload JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

INSERT INTO feature_flags (feature_key, is_enabled, payload, updated_at)
VALUES ('termination_feature', false, json_build_object('archived_on', now()), now())
ON CONFLICT (feature_key) DO UPDATE
SET is_enabled = EXCLUDED.is_enabled,
    payload = EXCLUDED.payload,
    updated_at = now();








