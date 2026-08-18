-- Consent history is deleted by user and inspected by user during support and
-- privacy investigations. Index the foreign key so those operations do not
-- require a sequential scan as the audit trail grows.
create index if not exists processing_consent_events_user_id_idx
  on private.processing_consent_events(user_id);
