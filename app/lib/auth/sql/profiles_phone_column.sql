-- Add optional phone field to profiles for account metadata persistence.
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS phone TEXT;

-- Optional index for admin/support lookup by phone.
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles (phone);
