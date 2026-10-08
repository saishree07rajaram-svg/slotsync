# SlotSync (PS-08) — Project Rules

**Tagline:** Book the lab without clashes
**Difficulty:** Challenging | **Category:** Club ops

## 1. Problem Context

The club's 3D printer, soldering stations and lab room are shared by everyone. Bookings currently happen in a WhatsApp group, slots clash, and a few people end up hogging the printer. SlotSync replaces this with a fair, conflict-free booking system.

## 2. Core Requirements (Must Build)

1. **Availability grid** — one-hour slots for the next 7 days, for each resource.
2. **Book and cancel** — book a slot with name, registration number and purpose; cancel it from "My bookings".
3. **Server-side validation** — the server rejects double bookings and bookings in the past.
4. **Fair use (KEY CHALLENGE)** — at most **2 hours per person, per resource, per day**, enforced on the server, with a clear message when the limit is hit.

## 3. Business Rules

| # | Rule | Enforced Where |
|---|------|----------------|
| R1 | Slots are exactly 1 hour long, aligned to the hour | Server |
| R2 | Only the next 7 days (including today) are bookable | Server |
| R3 | A slot can have only one active booking per resource | Server (+ DB unique constraint) |
| R4 | No bookings for slots that have already started or passed | Server |
| R5 | Max 2 active booked hours per registration number, per resource, per day | Server |
| R6 | Name, registration number and purpose are required and non-empty | Server (+ client hint) |
| R7 | A cancelled booking frees the slot and no longer counts toward the limit | Server |
| R8 | Users identify via registration number (no auth required) | — |

> The client may pre-check rules for UX, but the **server is the source of truth**. Never rely on frontend validation alone.

## 4. API Contract

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/resources` | List all bookable resources (printer, soldering stations, lab room) |
| GET | `/api/slots?resource=&date=` | Slots for a resource on a date with availability status |
| POST | `/api/bookings` | Create a booking |
| GET | `/api/bookings?reg=` | List bookings for a registration number ("My bookings") |
| DELETE | `/api/bookings/:id` | Cancel a booking |

### POST `/api/bookings` — Request

```json
{
  "resourceId": "printer-1",
  "date": "2026-10-08",
  "hour": 14,
  "name": "Asha K",
  "regNo": "RA2511003010001",
  "purpose": "Print enclosure for sensor project"
}
```

### Response Codes

| Code | When |
|------|------|
| 201 | Booking created |
| 200 | Fetch / cancel successful |
| 400 | Missing or invalid fields, past slot, date outside 7-day window |
| 404 | Resource or booking not found |
| 409 | Slot already booked (double booking) |
| 422 | Fair-use limit exceeded (2 hours/person/resource/day) |

### Error Format (always consistent)

```json
{
  "error": "LIMIT_EXCEEDED",
  "message": "You already have 2 hours booked on the 3D Printer for 8 Oct. Cancel one to book another."
}
```

Error codes: `VALIDATION_ERROR`, `PAST_SLOT`, `OUT_OF_RANGE`, `SLOT_TAKEN`, `LIMIT_EXCEEDED`, `NOT_FOUND`.

## 5. Concurrency & Data Integrity

- Prevent race conditions: two simultaneous requests for the same slot must result in exactly one success and one `409`.
- Use a **unique constraint** on `(resourceId, date, hour)` for active bookings, or wrap check-and-insert in a transaction/lock.
- Count fair-use hours **inside the same transaction** as the insert.
- Use one timezone consistently (store UTC or a fixed local zone such as IST); compare "past" using server time.
- Cancel = soft delete (`status: cancelled`) or hard delete, but be consistent with R7.

## 6. Suggested Data Model

**Resource:** `id`, `name`, `type`
**Booking:** `id`, `resourceId`, `date`, `hour`, `name`, `regNo`, `purpose`, `status` (active/cancelled), `createdAt`

## 7. UI Rules

- Grid shows resources × next 7 days × hourly slots with clear states: **Available**, **Booked**, **Past**, **Mine**.
- Booking form: name, registration number, purpose (all required).
- "My bookings" lookup by registration number with a cancel button.
- Show the server's error message verbatim to the user, especially for the fair-use limit.
- Disable or visually mute past slots, but do not trust this on the server.
- Refresh the grid after every book or cancel.

## 8. Acceptance Tests ("We'll Test")

1. Book **two** printer slots on the same day → both succeed (201).
2. Try a **third** on the same day, same person, same printer → rejected with a clear message (422).
3. Try a slot that is **already taken** → rejected (409).
4. **Cancel** one booking → succeeds, slot becomes free, and the person can book again.

### Extra edge cases to verify

- Booking a past hour → 400.
- Booking beyond 7 days → 400.
- Same person books 2 hours on the printer, then 1 on the soldering station → allowed (limit is per resource).
- Same person books 2 hours on one day, then 1 on the next day → allowed (limit is per day).
- Two parallel requests for one slot → one 201, one 409.
- Cancelling a non-existent booking → 404.

## 9. Stretch Goals (Only After Core Is Solid)

- **Waitlist:** automatically book the next person when someone cancels (must still respect the fair-use limit).
- **Admin view:** see the whole day across all resources.
- **Weekly calendar view.**

## 10. Do's and Don'ts

**Do**
- Validate everything on the server.
- Return clear, human-readable error messages.
- Keep the key challenge (fair use) correct before polishing the UI.
- Seed resources (3D printer, soldering stations, lab room) on startup.

**Don't**
- Don't rely on client-side checks for double booking or limits.
- Don't hard-code "today"; compute it at request time.
- Don't count cancelled bookings toward the daily limit.
- Don't add stretch goals before the four core requirements and four acceptance tests pass.

## 11. Definition of Done

- [ ] 7-day availability grid per resource
- [ ] Book with name, reg no, purpose
- [ ] Cancel from "My bookings"
- [ ] Double bookings and past bookings rejected by the server
- [ ] 2 hours/person/resource/day limit enforced with a clear message
- [ ] All four acceptance tests pass
- [ ] README with setup steps and API notes
