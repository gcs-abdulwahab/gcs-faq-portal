-- Run this script in your Supabase SQL Editor

-- 1. Create the FAQs table
create table if not exists public.faqs (
  id uuid default gen_random_uuid() primary key,
  faq_code text not null,
  category text not null,
  question text not null,
  answer text not null,
  updated_at timestamptz default now()
);

-- 2. Create the authorized editors table
create table if not exists public.faq_editors (
  email text primary key
);

-- Staff email addresses who have add/edit/delete permissions.
-- Each editor also needs a Supabase Auth user (Authentication -> Users -> Add user) with a password.
insert into public.faq_editors (email) values
  ('admin@gcslahore.edu.pk')
on conflict (email) do nothing;

-- 3. Enable Row Level Security (RLS)
alter table public.faqs enable row level security;
alter table public.faq_editors enable row level security;

-- Policy: A signed-in user can only check whether their own email is an editor.
-- No insert/update/delete policies, so the editor list can only be changed from the dashboard/SQL editor.
create policy "Users can read own editor row"
  on public.faq_editors for select
  using (email = auth.jwt() ->> 'email');

-- Policy: Anyone (students/public) can view FAQs
create policy "Public read access"
  on public.faqs for select
  using (true);

-- Policy: Only listed editors can insert, update, or delete FAQs
create policy "Editors can manage FAQs"
  on public.faqs for all
  using (auth.jwt() ->> 'email' in (select email from public.faq_editors))
  with check (auth.jwt() ->> 'email' in (select email from public.faq_editors));

-- 4. Seed Initial FAQs (Registrar, Controller of Examinations, Scholarships)
insert into public.faqs (faq_code, category, question, answer) values
  ('REG-01', 'Registrar Office', 'How do I register for courses each semester, and what is the add/drop deadline?', 'Course registration is completed through the online Student Portal (CMS) during the announced enrollment window prior to the start of classes. Students may add or drop courses without academic penalty within the first two weeks of the semester.'),
  ('REG-02', 'Registrar Office', 'How can I withdraw from a course after the add/drop period?', 'Students may apply to withdraw from a course up to the end of the designated withdrawal window (typically weeks 4–6 of the semester) through their academic advisor and department chairperson. A ''W'' grade will appear on the transcript, which does not affect CGPA calculation.'),
  ('REG-03', 'Registrar Office', 'What is the procedure for freezing a semester?', 'Submit a formal Semester Freeze Application to the Registrar’s Office before midterm examinations begin, citing valid medical or personal grounds. During a frozen semester, active student/bonafide status is temporarily suspended.'),
  ('REG-04', 'Registrar Office', 'How do I request a Migration Certificate or No Objection Certificate (NOC)?', 'Submit the prescribed application form along with a clearance slip (from the library, accounts, and department) and the requisite fee challan to the Registrar’s Office. Processing typically takes 5–7 working days.'),
  ('REG-05', 'Registrar Office', 'How do I correct my name, father’s name, or date of birth on university records?', 'Submit an application to the Registration Branch accompanied by attested copies of your Matriculation/O-Level certificate and CNIC/B-Form, along with the record correction fee.'),
  ('REG-06', 'Registrar Office', 'How do I obtain a Bonafide Student Certificate or Enrollment Verification?', 'Apply online via the student portal or submit a written request with a copy of your valid university ID card to the Registrar’s Office.'),
  ('COE-01', 'Controller of Examinations', 'When are examination date sheets issued, and how do I download my Roll Number Slip?', 'Date sheets are published on the university website and notice boards at least 2–3 weeks before exams. Roll Number Slips (Admit Cards) can be downloaded from the student portal once fee clearance and minimum attendance requirements (typically 75%) are verified.'),
  ('COE-02', 'Controller of Examinations', 'What should I do if I miss a midterm or final exam due to a medical emergency?', 'Immediately submit a written application to your Head of Department and the Controller of Examinations within 48 hours of the missed exam, attaching medical documentation from an authorized hospital. Approval for a makeup exam is subject to university rules.'),
  ('COE-03', 'Controller of Examinations', 'How can I apply for paper re-checking or re-totaling after results are declared?', 'Submit the Examination Grievance / Re-checking Form within 15 days of result declaration along with the prescribed per-course fee. Note that re-checking covers re-totaling of marks and ensuring no answer was left unmarked, rather than full re-evaluation.'),
  ('COE-04', 'Controller of Examinations', 'What is the process for repeating a failed course or improving a low grade?', 'Students may re-register for failed courses or apply for grade improvement during regular or summer semesters within the maximum degree duration. The better grade is reflected on the final transcript, though improved courses may be marked with an asterisk and excluded from merit positions.'),
  ('COE-05', 'Controller of Examinations', 'How do I apply for an Official Transcript or Provisional Certificate?', 'Once final semester results are notified, submit the Transcript/Provisional Certificate Application Form, final clearance certificate, and fee receipt to the Examination Branch.'),
  ('COE-06', 'Controller of Examinations', 'What is required for Degree Issuance and Verification?', 'Degrees are issued at the annual Convocation or upon urgent application thereafter. For degree verification (for HEC attestation or employers), submit copies of your final transcript, degree, CNIC, and the verification fee receipt to the Controller’s Office.'),
  ('SCH-01', 'Scholarships & Financial Aid', 'What types of scholarships are available to students?', 'Students can apply for Merit-Based Scholarships (based on admission test/semester GPA), Need-Based Financial Aid (such as HEC Need-Based Scholarships and university hardship funds), and External/Government Schemes (e.g., PEEF, Bait-ul-Mal, and corporate endowments).'),
  ('SCH-02', 'Scholarships & Financial Aid', 'Am I eligible to apply for Need-Based Financial Aid if I am enrolled on a self-finance seat?', 'Generally, no. Most government and institutional need-based programs (including HEC Need-Based Scholarships) require admission on regular merit and exclude self-finance seats.'),
  ('SCH-03', 'Scholarships & Financial Aid', 'What documents are required to apply for a Need-Based Scholarship?', 'Applicants must submit copies of student and parent/guardian CNICs, salary slips/income certificates (or business bank statements), last 6 months'' utility bills, rent agreement (if applicable), and fee receipts of siblings.'),
  ('SCH-04', 'Scholarships & Financial Aid', 'Can I hold two scholarships or financial aid awards at the same time?', 'No. Students are not permitted to avail dual financial assistance simultaneously. If selected for a second scholarship, you must notify the Financial Aid Office and choose one.'),
  ('SCH-05', 'Scholarships & Financial Aid', 'What GPA or attendance is required to maintain my scholarship in subsequent semesters?', 'Continuing recipients must maintain the minimum required CGPA (typically 2.50 for need-based and 3.50+ for merit scholarships), meet the 75% attendance threshold, and remain free of any disciplinary penalties.'),
  ('SCH-06', 'Scholarships & Financial Aid', 'How and when are scholarship stipends or tuition waivers disbursed?', 'Tuition waivers are adjusted directly against your semester fee challan before the due date. Monthly stipends (where applicable) are disbursed via bank transfer/crossed cheque after semester enrollment verification.');
