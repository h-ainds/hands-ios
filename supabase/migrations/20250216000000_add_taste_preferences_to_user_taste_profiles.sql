-- Add taste_preferences jsonb to UserTasteProfiles for onboarding NLP chips (6-7 strings).
ALTER TABLE "UserTasteProfiles"
ADD COLUMN IF NOT EXISTS taste_preferences jsonb;

COMMENT ON COLUMN "UserTasteProfiles".taste_preferences IS 'Array of 6-7 taste preference chip strings from onboarding NLP.';
