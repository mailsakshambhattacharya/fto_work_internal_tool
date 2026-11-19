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

1. Use **Add record** for one school or student. Provide a unique school code. A student ID must be unique within its school.
2. Use **Import Excel** to download the template and import up to 500 records per workbook (2 MB). Fill the **Schools** and/or **Students** sheets. Use text cells for identifiers with leading zeros. Students can reference a school already in the registry or one in the same workbook. A matching identifier updates the existing record. An empty optional cell clears that field. A failed import leaves the entire registry as it was.
3. Open a record from its list to edit it. **Update history** shows the time, entry method, and old and new values. Saves that leave all values unchanged do not create an update.
4. Use **Export Excel** for one workbook with **Schools**, **Students**, and **Update History** sheets. The history has one row per changed field and a shared Change ID for each save. Export timestamps are in UTC. Open a school and choose **Export school** for a school-specific workbook. A single export is limited to 4 MB.
5. Use **Ask records** for questions such as “Who is the principal at [school name]?”, “How many enrolled students are in Grade 10?”, “Which school has the fewest students?”, “Show student [student ID]”, or “Show recent changes.” Matching records open directly from the answer. Each question runs against the current registry.

## Set up on Vercel

Import the GitHub repository into the Vercel account that will own the app. Vite is the project framework. Provision an empty Postgres database and set these environment variables for each environment you intend to use. Keep preview and production databases separate. Where possible, put the database and function in the same region.

| Environment variable | Value |
| --- | --- |
| `DATABASE_URL` | Postgres connection URL. A pooled URL from the database provider works with the serverless API. `POSTGRES_URL` is also accepted. |
| `APP_PASSWORD` | A randomly generated workspace password, at least 16 characters. |
| `APP_SESSION_SECRET` | A separate random secret, at least 32 characters, for signing sessions. |

Deploy from the intended Vercel account. The first authenticated request for records initializes the database schema. To initialize it manually, set the database URL in your shell or in a gitignored `.env.local` and run `npm run db:migrate`. Verify that an unauthenticated visitor sees the sign-in screen and that you can sign in and export an empty workbook. Production starts with an empty registry.

Hosted access uses a shared workspace password. Anyone with the password can read, edit, and export all records. The update log tracks the entry method and timestamp. It does not identify individual staff members.

### Record assistant

The default assistant retrieves matching records from Postgres and formats answers locally. It supports English lookups, counts, school or grade breakdowns, and recent or dated activity for the fields in the registry. For questions that need more information, narrow the question to a school, student ID, grade, or date.

Optional OpenAI synthesis uses the Responses API. Enable it only if you are authorized to send matched registry details and user questions to OpenAI. Set `ALLOW_EXTERNAL_AI=true` and `OPENAI_API_KEY` in Vercel. `OPENAI_MODEL` defaults to `gpt-5-mini` and optionally configures the model. If generation is unavailable, the assistant returns the locally generated answer with its record links. [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)
