# CloudX v0.2
Next milestone: real accounts + database preparation.

Run:
npm install
npm run dev

Then create `.env.local` from `.env.example`, add Supabase URL and anon key, and run `supabase-schema.sql` in the Supabase SQL Editor.

The login/signup UI is connected to Supabase Auth. The file upload UI is still a local browser preview; the next milestone is Cloudflare R2 signed uploads and real 30 GB accounting.

Never expose R2 secret keys in NEXT_PUBLIC variables.