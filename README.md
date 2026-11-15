# GCS Student FAQs Portal

A collaborative, role-based FAQ web application built with **Next.js (App Router)**, **Tailwind CSS**, and **Supabase**, designed for deployment on **Vercel**.

## Features
- **Public View-Only Access:** Students and visitors can browse, filter by department, and search FAQs without logging in.
- **Role-Based Staff Editing:** Authorized staff emails listed in the `faq_editors` table can log in via email magic link to add, edit, or delete FAQs.
- **Dynamic Categories:** Pre-seeded with **Registrar Office**, **Controller of Examinations**, and **Scholarships & Financial Aid**, with support for creating new categories on the fly.

## Setup & Deployment Steps
1. **Create a Supabase Project:** Go to [supabase.com](https://supabase.com), create a new project, and run the SQL in `supabase/schema.sql` inside the **SQL Editor**.
2. **Add Editor Emails:** Update the `faq_editors` table in Supabase with your authorized staff email addresses.
3. **Push to GitHub:** Upload this folder to a GitHub repository.
4. **Deploy to Vercel:**
   - Import the repository in [vercel.com](https://vercel.com).
   - Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` under **Environment Variables**.
   - Click **Deploy**.
5. **Configure Auth Redirect:** Copy your live Vercel URL and set it as the **Site URL** in Supabase under **Authentication → URL Configuration**.
