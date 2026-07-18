# Book a Free Trial Class — Testing Guide

**Feature:** Free Trial Class booking & management
**For:** Client / QA testing (UAT)
**Version:** 1.0

---

## 1. What this feature does

A visitor can request a **free trial class** from the website. The academy team then
contacts them, evaluates the student, schedules the trial class, the teacher conducts it,
and finally the student can be **enrolled** — all tracked in one place.

This guide walks you through testing the whole journey, end to end.

---

## 2. Before you start

You will need:

| Role | Where to log in | Login |
|------|-----------------|-------|
| **Website visitor** (no login needed) | `[SITE-URL]/get-started` | — |
| **Admin** | `[SITE-URL]/signin` | _admin email + password_ |
| **Academic Coach** | `[SITE-URL]/signin` | _coach email + password_ |
| **Teacher** | `[SITE-URL]/signin` | _teacher email + password_ |

> Replace `[SITE-URL]` with the actual website address shared with you.
> Use a **real email address you can access** when booking the trial — the system sends a
> verification code and reminder emails to it.

**Tip:** Keep this document open and tick each ✅ box as you test.

---

## 3. Test Scenario 1 — Book a Free Trial (as a website visitor)

| # | Step | What you should see |
|---|------|---------------------|
| 1 | Open `[SITE-URL]/get-started` | A form titled **"Book a Free Trial Class"** |
| 2 | Fill **Student details** (name, grade, country, etc.) | Fields accept your input |
| 3 | Fill **Parent details** — use a real email | — |
| 4 | Fill **Learning requirements** (subject, level, preferred days/time) | — |
| 5 | Accept the consent checkboxes and click **Request Free Trial** | A **"Verify your email"** screen appears |
| 6 | Check the parent email inbox | You receive an email with a **6-digit code** |
| 7 | Enter the code and submit | A **"Trial Request Received!"** confirmation appears |

**Checks:**
- [ ] Form submits successfully
- [ ] Verification code email arrives
- [ ] Wrong code shows an error; correct code works
- [ ] Confirmation message is shown at the end

> **Duplicate test (optional):** Submit again with the same email/mobile — the system should
> warn that a request already exists.

---

## 4. Test Scenario 2 — Team receives & processes the lead (Admin / Coach)

| # | Step | What you should see |
|---|------|---------------------|
| 1 | Log in as **Admin** or **Coach** → open **Trial Classes** (`/leads`) | The new request appears at the top, status **NEW** |
| 2 | You should also see a **notification** (bell icon) about the new request | Notification present |
| 3 | Open the request to view full details | Student, parent, and learning details all shown |
| 4 | Assign an **Academic Coach** | Coach is assigned; status updates |
| 5 | Click **Evaluate** and enter skill scores | An **overall %** is calculated automatically |
| 6 | Open **Recommendation** | Suggested level / best-fit teacher is shown |
| 7 | **Assign a Teacher** (manual or auto) | Teacher assigned; status → *Teacher Assigned* |

**Checks:**
- [ ] New request visible with correct details
- [ ] Notification received
- [ ] Evaluation calculates an overall score
- [ ] Recommendation appears
- [ ] Teacher can be assigned

---

## 5. Test Scenario 3 — Schedule the trial & reminders

| # | Step | What you should see |
|---|------|---------------------|
| 1 | In the lead, click **Schedule Trial** | Enter date, time & meeting link |
| 2 | Save the trial | Status → **Trial Scheduled** |
| 3 | Check the parent email | A **"trial scheduled"** email is received |
| 4 | Use **Send Reminder Now** (optional) | A reminder email is sent immediately |

**Checks:**
- [ ] Trial can be scheduled with date/time/link
- [ ] Parent receives the scheduling email
- [ ] Manual reminder works

> **Automatic reminders:** The system also sends reminder emails **24 hours** and **1 hour**
> before the trial. (These trigger by time; the "Send Reminder Now" button lets you verify the
> email content without waiting.)

---

## 6. Test Scenario 4 — Teacher conducts the trial

| # | Step | What you should see |
|---|------|---------------------|
| 1 | Log in as the **assigned Teacher** → open **Trial Classes** (`/teacher/trials`) | The scheduled trial appears in the list |
| 2 | Mark **Attendance** (Present / Absent) | Attendance is saved |
| 3 | Submit **Feedback** — teacher rating + "recommend to enroll" | Feedback saved |
| 4 | (Optional) Record **parent feedback** — rating + interested | Saved |

**Checks:**
- [ ] Teacher sees their trial
- [ ] Attendance can be marked
- [ ] Teacher & parent feedback can be recorded

---

## 7. Test Scenario 5 — Convert to a Student (enrolment)

| # | Step | What you should see |
|---|------|---------------------|
| 1 | Back as **Admin / Coach**, open the lead → **Coach Decision** | Options: **Enroll / Follow-up / Reject** |
| 2 | Choose **Enroll** | Status → **Converted**; a new **Student** is created |
| 3 | Check the student's email | A **welcome email with a temporary password** is received |
| 4 | Open **Students** (`/students`) | The new student appears with a code like **ST-00001** |
| 5 | Log in as that student with the temporary password | Student dashboard opens |

**Checks:**
- [ ] Enroll creates a student account
- [ ] Welcome email with temporary password is sent
- [ ] New student appears in the Students list
- [ ] Student can log in

> Choosing **Follow-up** keeps the lead waiting for a decision; **Reject** closes it. Both should
> update the status without creating a student.

---

## 8. Test Scenario 6 — Reports & Funnel (Admin)

| # | Step | What you should see |
|---|------|---------------------|
| 1 | In **Trial Classes**, open the **Stats / Funnel** view | Pipeline counts and a conversion funnel |
| 2 | Confirm your test lead is reflected in the numbers | Counts increase as leads progress |

**Checks:**
- [ ] Stats reflect the leads you created
- [ ] Funnel shows the stages from request → converted

---

## 9. Full journey — quick checklist

- [ ] 1. Visitor books a free trial (with email verification)
- [ ] 2. Team receives the lead + notification
- [ ] 3. Lead is evaluated & a teacher is assigned
- [ ] 4. Trial is scheduled + emails/reminders sent
- [ ] 5. Teacher marks attendance & feedback
- [ ] 6. Coach enrolls → student account created
- [ ] 7. New student can log in
- [ ] 8. Reports/funnel reflect the activity

---

## 10. How to report an issue

For anything that does not work as described above, please note:

1. **Which step** (Scenario # and step #)
2. **What you did** (the input you entered)
3. **What happened** vs **what you expected**
4. A **screenshot** if possible
5. The **email address / role** you used

Send these back to the development team so each issue can be reproduced and fixed.

---

*Thank you for testing. Every ✅ helps confirm the flow is ready for launch.*
