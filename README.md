# Scholarship Monitoring and Academic Compliance System

HTML/CSS/JavaScript front end + Supabase (PostgreSQL + Auth), deployable on GitHub Pages.

## Setup (about 10 minutes)
1. Create a project at https://supabase.com.
2. SQL Editor > paste and run `supabase/schema.sql`.
3. Authentication > Providers > Email: for lab use, turn off "Confirm email".
4. Project Settings > API: copy the Project URL and anon key into `js/config.js`.
5. Open the app, click **Create account**, then in the SQL Editor promote yourself:
   `update profiles set role = 'admin' where id = (select id from auth.users where email = 'you@example.com');`
6. Sign in.

## Run in Visual Studio / VS Code
Open the folder, then use the **Live Server** extension (right-click `index.html` > Open with Live Server).
Opening the file directly also works.

## Deploy to GitHub Pages
Push to a GitHub repo > Settings > Pages > Deploy from branch `main` / root.

## Documented compliance rule
A verified submission is **Compliant** only if all are true, otherwise **With Deficiency**:
- GWA meets the program requirement. With `LOWER_IS_BETTER: true` (1.0 = best) that means `GWA <= required_gwa`; set it to `false` for scales where higher is better (`GWA >= required_gwa`). Change the scale in `js/config.js`.
- Units enrolled >= program minimum units.
- Failed subjects = 0 unless the program allows failing grades.
- No unresolved incomplete subjects (extra rule added to support BR-06).

## Traceability
| Requirement | Feature | Location |
|---|---|---|
| FR-01/02 | Register scholar, assign program | Scholars tab |
| FR-03 | Program requirements | Programs tab |
| FR-04/05 | Grade submission with year and semester | Grade submissions tab |
| FR-06 / BR-04, BR-09 | Verify (staff only, once) | `verify()` and RLS |
| FR-07/08/09 | Evaluation, deficiency notes, status | `evaluate()` |
| FR-10 | Pending count and filter | Dashboard, Submissions |
| BR-03 | One submission per scholar/year/semester | `unique` constraint |
| BR-10 | Grades visible only to staff | RLS policies |

Note: only `admin` and `staff` roles can sign in to the app. Scholar login is not implemented (optional in the lab).
