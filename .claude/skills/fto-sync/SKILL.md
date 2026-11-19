---
name: fto-sync
description: Sync school data from the source website into Schooldesk and save the latest consolidated FTO Excel. Use when the user says "run fto sync", "sync schools", "update the FTO sheet", or asks to pull new schools and students from the source site.
---

# FTO sync

Downloads new school and student files from the source website, uploads them to Schooldesk, and saves the latest consolidated FTO Excel.

## Settings (fill these in once)

| Setting | Value |
| --- | --- |
| Source site | `[SOURCE SITE URL, e.g. https://backend.example.com/schools]` |
| Where the school list is | `[e.g. "the Schools tab"]` |
| How to download school/principal details | `[e.g. "open the school > Export > School details"]` |
| How to download the student file | `[e.g. "open the school > Students tab > Download Excel"]` |
| School code rule | `[e.g. first letters of each word + pincode, like AVM-608301]` |
| Schooldesk | `https://fto-work-internal-tool.vercel.app` |
| Download folder | `[e.g. C:\Users\NAME\Downloads\fto-sync]` |
| Where to save the FTO file | `[e.g. C:\Users\NAME\Desktop\FTO latest.xlsx]` |

If any setting still has `[brackets]`, ask the user for it before starting, and offer to save the answer into this file.

## Before you start

- Work in the user's Chrome with Claude in Chrome.
- The user is already signed in to both sites. **Never type a password.** If a sign-in page appears, stop and ask the user to sign in.
- Don't click anything on the source site that changes data. Only view and download.

## Step 1: Find what is new

1. Open Schooldesk > **Schools** and note every school name and its student count.
2. Open the source site and list every school there.
3. New schools are those not in Schooldesk. Changed schools are those with more students on the source site than in Schooldesk.
4. Show the user this list and wait for a go-ahead before continuing.

## Step 2: For each new or changed school

### a) School and principal details

- On the source site, download the school/principal file and save it in the download folder.
- In Schooldesk, if the school doesn't exist yet, click **Add school** and fill in: School name, School code (using the code rule), Onboarding date (the DATE from the file, if any), Principal name, Principal email, Principal phone, Coordinator name, Coordinator email, Coordinator phone, State, Pincode.
- Copy values exactly. Leave a field blank rather than guessing.

### b) Students

- On the source site, download the school's student file (named like `student_data (N).xlsx`).
- Right away, record which school this file belongs to. The file has no school name, so match it from the page it was downloaded on. Renaming the saved file to include the school name helps.
- In Schooldesk, go to **Overview**, drop or upload the file in the drop box, choose the matching school, leave **Update changed details** unticked, and click **Import records**.
- Write down the result: Added, Updated, Repeats flagged, and Skipped rows.

## Step 3: Export the latest consolidated file

- In Schooldesk, click **Export FTO** and save it to the FTO file location, replacing the old file.
- Open the **FTO sheet** page and check that the school and student totals match what was uploaded.

## Step 4: Report back

Give a short table: School | Added | Repeats | Skipped (and why). Then list anything uncertain:
- a student file you couldn't tie to a school
- missing principal or coordinator details
- rows skipped for a missing student ID

## Rules

- If you can't tell which school a student file belongs to, skip that file and tell the user. Never guess the school.
- Don't delete or edit existing schools or students unless the user asks.
- If the source site has a "download all" or bulk export, ask before using it.
