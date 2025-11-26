-- Normalize previous bank details status values

UPDATE onboarding_data
SET bank_details_status = 'skipped'
WHERE bank_details_status = 'skipped_by_user';

