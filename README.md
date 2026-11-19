# Schooldesk

Schooldesk is an internal registry for schools, principal contacts, and student records. It includes Excel import and export, a before-and-after update log, and a record assistant with links back to its sources.

## Run locally

Install Node.js 24 and run:

```sh
npm ci
npm run dev
```

Open `http://127.0.0.1:5173`. With no database or workspace credentials configured, the local server starts with an empty registry in `.data/local` and listens on loopback. Local records and environment variables are ignored by Git.

```sh
npm test
npm run build
```

## Work with records

1. Use **Add record** for a school or student. Give each school a unique code and enter its area, city, and onboarding date when available. New schools default to the current date in India. Existing schools default to the date their record was created. A student ID must be unique within its school.
2. To add a raw `student_data` file from the test website, use **Upload students**, choose the file, and pick its school. The importer reads the `student_id`, `first_name`, `last_name`, `grade`, `email`, and `test_attempt_code` columns directly. An email of `NA` is saved as blank. Rows with no student ID, name, or grade are skipped and listed in the upload log, and the rest of the file is still imported. Save the school first with its principal, coordinator, state, and pincode, because those details fill the FTO sheet.
3. Use **Import Excel** or **Upload students** to download the template and import up to 500 records per workbook (2 MB). Choose a school whenever the workbook contains student rows. The school can already exist or be listed in the workbook’s **Schools** sheet. The **Students** sheet can omit school codes. Any codes filled in must match the selected school. Use text cells for IDs with leading zeros. For school updates, a blank onboarding date keeps the saved date. A failed import saves no records.
4. Repeated rows and already saved student IDs are flagged. Select **Update changed details** if the spreadsheet should also update existing student records. Matching rows are still flagged. The first occurrence of a student ID in the workbook is used.
5. Under **Update history**, use **Record changes** for before-and-after values and **Student uploads** for each upload’s added, updated, and repeated counts. Select a school to see its onboarding date, area, city, and school-specific totals. Open an upload to inspect individual rows.
6. Use **Export FTO** for the consolidated FTO sheet. It has the same columns as the FTO master sheet, with one block per school. The school details (DATE, principal, coordinator, state, and pincode) appear on the first row of each block, and a blank row separates schools. DATE is the school's onboarding date. Open a school and choose **Export FTO** to export only that school.
7. Use **Export Excel** to download Schools, Students, Update History, Student Uploads, and Student Upload Rows together. Upload summaries and rows share an Upload ID. Activity timestamps are in UTC. Open a school and choose **Export school** for a school-specific workbook. A single export is limited to 4 MB.
8. Ask questions such as “When was [school name] onboarded?”, “How many repeats were flagged at [school name]?”, or “How many enrolled students are in Grade 10?” Matching records open directly from the answer.

## Set up on Vercel

Import the GitHub repository into the Vercel account that will own the app. Vite is the project framework. Provision an empty Postgres database and set these environment variables for each environment you intend to use. Keep preview and production databases separate. Where possible, put the database and function in the same region.

| Environment variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres connection URL. A pooled URL from the database provider works with the serverless API. `POSTGRES_URL` is also accepted. |
| `APP_PASSWORD` | The workspace password, at least 12 characters. |
| `APP_SESSION_SECRET` | A separate random secret, at least 32 characters, for signing sessions. |

Deploy from the intended Vercel account. The first authenticated request for records initializes the database schema. To initialize it manually, set the database URL in your shell or in a gitignored `.env.local` and run `npm run db:migrate`. Verify that an unauthenticated visitor sees the sign-in screen and that you can sign in and export an empty workbook. Production starts with an empty registry.

Hosted access uses a shared workspace password. Anyone with the password can read, edit, and export all records. The update log tracks the entry method and timestamp. It does not identify individual staff members.

### Record assistant

The default assistant retrieves matching records from Postgres and formats answers locally. It supports English lookups, counts, school or grade breakdowns, and recent or dated activity for the fields in the registry. For questions that need more information, narrow the question to a school, student ID, grade, or date.

Optional OpenAI synthesis uses the Responses API. Enable it only if you are authorized to send matched registry details and user questions to OpenAI. Set `ALLOW_EXTERNAL_AI=true` and `OPENAI_API_KEY` in Vercel. `OPENAI_MODEL` defaults to `gpt-5-mini` and optionally configures the model. If generation is unavailable, the assistant returns the locally generated answer with its record links. [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
