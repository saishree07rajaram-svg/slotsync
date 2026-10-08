# SlotSync (PS-08) — Conflict-Free Lab Resource Booking System

> **Tagline:** Book the lab without clashes  
> **Difficulty:** Challenging | **Category:** Club ops  
> **Key Challenge:** Fair-Use Quota Enforcement (Max 2 hours/person/resource/day on server)

---

## 1. Overview & Problem Context

In club and makerspace environments, expensive equipment like **3D printers**, **soldering stations**, and **lab workspaces** are shared by dozens of members. When bookings occur informally (e.g. WhatsApp groups or spreadsheets), slots clash, disputes arise, and a few individuals end up monopolizing critical hardware.

**SlotSync** solves this by providing a fair, conflict-free, real-time booking web application with strict server-side validation and automated fair-use governance.

---

## 2. Core Business Rules (R1 – R8)

| Rule | Description | Enforcement Level | HTTP Status on Violation |
|---|---|---|---|
| **R1** | Slots are exactly **1 hour long**, aligned to the hour (e.g., 14:00 - 15:00). | Server | `400 VALIDATION_ERROR` |
| **R2** | Only the **next 7 days (including today)** are bookable. | Server | `400 OUT_OF_RANGE` |
| **R3** | A slot can have **only one active booking per resource** (no double bookings). | Server + DB Unique Constraint | `409 SLOT_TAKEN` |
| **R4** | No bookings for slots that have **already started or passed**. | Server (real-time comparison) | `400 PAST_SLOT` |
| **R5** | **Max 2 active booked hours per registration number, per resource, per day**. | Server (Atomic check & insert) | `422 LIMIT_EXCEEDED` |
| **R6** | **Name, Registration Number, and Purpose** are mandatory and non-empty. | Server (+ Client hints) | `400 VALIDATION_ERROR` |
| **R7** | A cancelled booking **frees the slot** and no longer counts toward the limit. | Server | `200 OK` (Quota restored) |
| **R8** | Users identify via college **Registration Number** (no auth overhead required). | System | N/A |

---

## 3. REST API Contract

### Summary of Endpoints

| Method | Endpoint | Description | Status Codes |
|---|---|---|---|
| `GET` | `/api/resources` | List all bookable equipment and lab spaces | `200` |
| `GET` | `/api/slots?resource={id}&date={YYYY-MM-DD}` | Get hourly availability for a resource on a specific date | `200`, `400`, `404` |
| `POST` | `/api/bookings` | Create a new slot booking (Atomically enforces R1-R6) | `201`, `400`, `404`, `409`, `422` |
| `GET` | `/api/bookings?reg={regNo}` | Retrieve all active and historical bookings for a student | `200`, `400` |
| `DELETE` | `/api/bookings/:id` | Cancel a booking, freeing the slot & quota (Enforces R7) | `200`, `404` |
| `POST` | `/api/waitlist` | *(Stretch)* Join waitlist for an occupied slot | `201`, `400` |
| `GET` | `/api/admin/overview?date={YYYY-MM-DD}` | *(Stretch)* Admin whole-day cross-equipment schedule matrix | `200` |
| `POST` | `/api/reset` | Reset database to clean seed state | `200` |

### Sample POST Request (`/api/bookings`)
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

### Consistent Error Response Format
```json
{
  "error": "LIMIT_EXCEEDED",
  "message": "You already have 2 hours booked on the 3D Printer for 8 Oct. Cancel one to book another."
}
```

---

## 4. Acceptance Test Scenarios ("We'll Test")

The application includes an **Automated Acceptance Test Runner tab** verifying all scenarios live:

1. **Test 1:** Book two printer slots on the same day $\rightarrow$ Both succeed (`201 Created`).
2. **Test 2 (KEY CHALLENGE):** Try a third slot on the same day, same person, same printer $\rightarrow$ Rejected with verbatim clear message (`422 LIMIT_EXCEEDED`).
3. **Test 3:** Try a slot that is already taken $\rightarrow$ Rejected (`409 SLOT_TAKEN`).
4. **Test 4:** Cancel one booking $\rightarrow$ Succeeds (`200 OK`), slot becomes available, and the person can book again (`201 Created`).

### Additional Edge Cases Covered:
- **Past Hour Check:** Booking a slot in the past $\rightarrow$ Rejected (`400 PAST_SLOT`).
- **7-Day Window Check:** Booking 10 days in the future $\rightarrow$ Rejected (`400 OUT_OF_RANGE`).
- **Cross-Resource Independence:** Booking 2 hours on printer then 1 hour on soldering station $\rightarrow$ Allowed (limits are per resource).
- **Cross-Day Independence:** Booking 2 hours today and 2 hours tomorrow $\rightarrow$ Allowed (limits are per day).
- **Non-existent Cancellation:** Cancelling invalid ID $\rightarrow$ Returns `404 NOT_FOUND`.

---

## 5. Stretch Goals Implemented

1. **Smart Waitlist & Auto-Promotion:** When a user cancels a booking, the system automatically checks the waitlist for that slot and promotes the first candidate whose daily fair-use quota has not been exceeded.
2. **Club Ops Admin Overview Matrix:** Real-time hour-by-hour cross-equipment schedule matrix for any selected date with utilization metrics, active member tallies, and waitlist counters.
3. **Interactive Test Suite Tab:** Evaluators can click a single button to run the entire verification suite directly in the browser and observe live HTTP requests, status codes, and JSON responses.
4. **Live Fair-Use Quota Meter:** Real-time visual progress bar showing users their daily quota status (*0/2, 1/2, 2/2*) before attempting reservations.

---

## 6. How to Run the Application

The web application is designed to be **100% zero-dependency and runnable immediately**:

### Option A: Open Directly in Any Web Browser (Recommended & Instant)
Simply double-click or open `index.html` in your browser:
```bash
# Path:
C:\Users\Sai Shree R\.gemini\antigravity-ide\scratch\slotsync-app\index.html
```
The application comes pre-packaged with an in-memory & LocalStorage client-server simulation engine (`api.js`) that enforces all HTTP status codes, R1-R8 business rules, and transactions with 0 latency.

### Option B: Run with Python Server
```bash
cd "C:\Users\Sai Shree R\.gemini\antigravity-ide\scratch\slotsync-app"
python server.py
# Open: http://localhost:3000
```

### Option C: Run with Node.js
```bash
cd "C:\Users\Sai Shree R\.gemini\antigravity-ide\scratch\slotsync-app"
node server.js
# Open: http://localhost:3000
```

---

## 7. Definition of Done Checklist

- [x] 7-day availability grid per resource
- [x] Book with name, reg no, purpose
- [x] Cancel from "My bookings"
- [x] Double bookings and past bookings rejected by the server (`409`, `400`)
- [x] 2 hours/person/resource/day limit enforced with clear verbatim message (`422`)
- [x] All four acceptance tests and edge cases pass with automated runner
- [x] Modern, accessible, glassmorphic UI matching top-tier web design guidelines
- [x] Complete documentation & API specification
