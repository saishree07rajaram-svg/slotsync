# SlotSync (PS-08) — Skills Required

Skills needed to build SlotSync, what each is used for, and how to know you've got it right.

## 1. Backend & API Design

| Skill | Used For | Done Right When |
|-------|----------|-----------------|
| REST API design | The 5 endpoints (`/api/resources`, `/api/slots`, `/api/bookings`, `/api/bookings?reg=`, `/api/bookings/:id`) | Correct verbs, resource-based URLs, consistent JSON |
| HTTP status codes | 201, 400, 404, 409, 422 | Each failure case maps to the right code |
| Input validation | Required name, reg no, purpose; valid date and hour | Bad input never reaches the database |
| Error handling | Clear fair-use and conflict messages | Every error has a `error` code and human-readable `message` |
| Query parameters | `?resource=&date=` and `?reg=` | Missing or malformed params return 400, not a crash |

**Suggested stacks (pick one):** Node.js + Express, Python + Flask/FastAPI, or Java + Spring Boot.

## 2. Data & Persistence

| Skill | Used For | Done Right When |
|-------|----------|-----------------|
| Data modelling | Resource and Booking entities | Schema supports all queries without hacks |
| SQL or document DB basics | Storing bookings, querying by resource, date, reg no | Queries are correct and indexed on `(resourceId, date, hour)` |
| Unique constraints / indexes | Preventing double bookings at DB level | Duplicate insert fails even if app logic is bypassed |
| Transactions | Atomic "check limit then insert" | No partial or inconsistent writes |
| Seeding data | Printer, soldering stations, lab room on startup | App works on a fresh database |

**Options:** SQLite (simplest), PostgreSQL/MySQL, or MongoDB.

## 3. Core Logic Skills (The Key Challenge)

| Skill | Used For | Done Right When |
|-------|----------|-----------------|
| Date and time handling | 7-day window, "slot in the past", hourly slots | One consistent timezone; no off-by-one at midnight or hour boundaries |
| Rule enforcement | Max 2 hours per person, per resource, per day | Counts only active bookings, scoped by resource and date |
| Conflict detection | Rejecting overlapping or duplicate slots | Same slot twice returns 409 |
| Concurrency awareness | Two people booking the same slot at once | Exactly one succeeds |
| Edge-case thinking | Cancel then rebook, cross-resource, cross-day | All extra edge cases in `rules.md` pass |

## 4. Frontend Skills

| Skill | Used For | Done Right When |
|-------|----------|-----------------|
| HTML / CSS layout | Availability grid (resources × days × hours) | Readable on laptop and phone |
| JavaScript (fetch / async) | Calling the API, refreshing the grid | UI updates after every book or cancel |
| Forms and validation UX | Booking form, "My bookings" lookup | Required fields flagged; server errors shown verbatim |
| State handling | Selected resource/date, loading and error states | No stale grid, no silent failures |
| Visual states | Available, Booked, Past, Mine | Users can tell slot status at a glance |

**Options:** Vanilla JS, React, Vue, or server-rendered templates.

## 5. Testing & Debugging

| Skill | Used For | Done Right When |
|-------|----------|-----------------|
| API testing | Postman, curl, or Thunder Client | All four "We'll test" scenarios pass |
| Automated tests | Unit tests for limit and conflict logic | Tests cover limit, conflict, past-slot, cancel |
| Race-condition testing | Parallel requests to one slot | One 201, one 409 |
| Reading logs and errors | Debugging failed bookings | Issues traced to cause quickly |

## 6. Tools & Workflow

| Skill | Used For |
|-------|----------|
| Git and GitHub | Version control, meaningful commits |
| Postman / curl | Manually exercising the API |
| Browser DevTools | Inspecting network calls and UI bugs |
| README writing | Setup steps, API notes, assumptions |
| Basic deployment (optional) | Render, Railway, or Vercel so the club can actually use it |

## 7. Stretch-Goal Skills

| Goal | Extra Skills Needed |
|------|---------------------|
| Waitlist (auto-book next person on cancel) | Queue modelling, event-style logic, re-checking fair-use on promotion |
| Admin view of the whole day | Aggregation queries, table or timeline UI |
| Weekly calendar view | Calendar layout, date math, responsive grid |

## 8. Suggested Learning and Build Order

1. Data model and seed resources
2. `GET /api/resources` and `GET /api/slots`
3. `POST /api/bookings` with validation (past, window, double booking)
4. Fair-use limit (the key challenge) with clear message
5. `GET /api/bookings?reg=` and `DELETE /api/bookings/:id`
6. Availability grid and booking form
7. "My bookings" and cancel flow
8. Tests for the four acceptance scenarios and edge cases
9. Stretch goals, then README and deploy

## 9. Skill Self-Check

- [ ] I can explain why the server, not the UI, must enforce the 2-hour limit.
- [ ] I can prevent two simultaneous bookings of the same slot.
- [ ] I can compute "today", "past slot" and the 7-day window correctly.
- [ ] I can return the right status code and message for each failure.
- [ ] I can test the full flow: book two, try a third, try a taken slot, cancel one.
