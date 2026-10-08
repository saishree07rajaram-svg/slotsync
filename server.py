"""
SlotSync (PS-08) — Python REST API Server
Zero external dependencies (uses standard library http.server).
Implements the full REST API contract and business rules R1-R8.
"""

import http.server
import socketserver
import json
import urllib.parse
from datetime import datetime, date, timedelta
import os

PORT = int(os.environ.get("PORT", 3000))

RESOURCES = [
    {
        "id": "printer-1",
        "name": "3D Printer (Ultimaker S5)",
        "type": "3D Printer",
        "desc": "Dual-extrusion industrial FDM printer with 0.4mm nozzle for precision enclosures.",
        "icon": "🖨️",
        "operatingHours": {"start": 8, "end": 22}
    },
    {
        "id": "soldering-1",
        "name": "Soldering Station 1 (Weller)",
        "type": "Soldering",
        "desc": "Weller WT1010 high-precision temperature-controlled ESD-safe soldering setup.",
        "icon": "⚡",
        "operatingHours": {"start": 8, "end": 22}
    },
    {
        "id": "soldering-2",
        "name": "Soldering Station 2 (Hakko)",
        "type": "Soldering",
        "desc": "Hakko FX-888D thermal workstation with activated carbon fume extraction.",
        "icon": "🔥",
        "operatingHours": {"start": 8, "end": 22}
    },
    {
        "id": "lab-room",
        "name": "Lab Room (Collaborative Bench)",
        "type": "Lab Space",
        "desc": "Shared hardware development bench with oscilloscope and DC power supplies.",
        "icon": "🔬",
        "operatingHours": {"start": 8, "end": 22}
    }
]

bookings = []
waitlists = []

def get_booking_window():
    today = date.today()
    return [(today + timedelta(days=i)).isoformat() for i in range(7)]

def format_human_date(date_str):
    try:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        return dt.strftime("%-d %b") if os.name != 'nt' else dt.strftime("%#d %b")
    except Exception:
        return date_str

class SlotSyncHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, status_code, data):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path
        params = urllib.parse.parse_qs(parsed.query)

        # Static files
        if not path.startswith("/api/"):
            if path == "/":
                self.path = "/index.html"
            return super().do_GET()

        # GET /api/resources
        if path == "/api/resources":
            return self.send_json(200, RESOURCES)

        # GET /api/slots?resource=&date=
        if path == "/api/slots":
            res_id = params.get("resource", [""])[0]
            date_str = params.get("date", [""])[0]

            if not res_id or not date_str:
                return self.send_json(400, {"error": "VALIDATION_ERROR", "message": "Resource and date query parameters are required."})

            res = next((r for r in RESOURCES if r["id"] == res_id), None)
            if not res:
                return self.send_json(404, {"error": "NOT_FOUND", "message": f"Resource '{res_id}' not found."})

            allowed_dates = get_booking_window()
            if date_str not in allowed_dates:
                return self.send_json(400, {"error": "OUT_OF_RANGE", "message": "Date is outside the 7-day booking window."})

            now = datetime.now()
            today_str = now.strftime("%Y-%m-%d")
            curr_hour = now.hour

            active_bookings = [b for b in bookings if b["resourceId"] == res_id and b["date"] == date_str and b["status"] == "active"]
            slots = []
            for h in range(8, 22):
                is_past = (date_str < today_str) or (date_str == today_str and h <= curr_hour)
                existing = next((b for b in active_bookings if b["hour"] == h), None)
                slots.append({
                    "hour": h,
                    "timeStr": f"{h:02d}:00 - {h+1:02d}:00",
                    "status": "past" if is_past else ("booked" if existing else "available"),
                    "isPast": is_past,
                    "booking": existing
                })

            return self.send_json(200, {
                "resourceId": res_id,
                "resourceName": res["name"],
                "date": date_str,
                "slots": slots
            })

        # GET /api/bookings?reg=
        if path == "/api/bookings":
            reg_no = params.get("reg", [""])[0].strip().upper()
            if not reg_no:
                return self.send_json(400, {"error": "VALIDATION_ERROR", "message": "Registration number parameter required."})

            user_bookings = [b for b in bookings if b["regNo"].upper() == reg_no]
            enriched = []
            for b in user_bookings:
                res_meta = next((r for r in RESOURCES if r["id"] == b["resourceId"]), None)
                enriched.append({
                    **b,
                    "resourceName": res_meta["name"] if res_meta else b["resourceId"],
                    "resourceIcon": res_meta.get("icon", "📌") if res_meta else "📌",
                    "timeStr": f"{b['hour']:02d}:00 - {b['hour']+1:02d}:00"
                })
            return self.send_json(200, enriched)

        return self.send_json(404, {"error": "NOT_FOUND", "message": "Endpoint not found"})

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        content_len = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_len).decode("utf-8")
        try:
            payload = json.loads(post_data) if post_data else {}
        except Exception:
            return self.send_json(400, {"error": "VALIDATION_ERROR", "message": "Invalid JSON payload."})

        # POST /api/bookings
        if path == "/api/bookings":
            name = (payload.get("name") or "").strip()
            reg_no = (payload.get("regNo") or "").strip().upper()
            purpose = (payload.get("purpose") or "").strip()
            res_id = payload.get("resourceId")
            date_str = payload.get("date")
            hour = payload.get("hour")

            if not name or not reg_no or not purpose:
                return self.send_json(400, {"error": "VALIDATION_ERROR", "message": "Name, registration number, and purpose are required."})

            if hour is None or not isinstance(hour, int) or hour < 0 or hour > 23:
                return self.send_json(400, {"error": "VALIDATION_ERROR", "message": "Slot hour must be integer 0-23."})

            res = next((r for r in RESOURCES if r["id"] == res_id), None)
            if not res:
                return self.send_json(404, {"error": "NOT_FOUND", "message": "Resource not found."})

            allowed_dates = get_booking_window()
            if date_str not in allowed_dates:
                return self.send_json(400, {"error": "OUT_OF_RANGE", "message": "Date is outside 7-day booking window."})

            now = datetime.now()
            today_str = now.strftime("%Y-%m-%d")
            if date_str < today_str or (date_str == today_str and hour <= now.hour):
                return self.send_json(400, {"error": "PAST_SLOT", "message": "Cannot book past slot."})

            # Double booking check
            if any(b["resourceId"] == res_id and b["date"] == date_str and b["hour"] == hour and b["status"] == "active" for b in bookings):
                return self.send_json(409, {"error": "SLOT_TAKEN", "message": f"Slot at {hour:02d}:00 is already booked."})

            # Fair use check
            user_hours = len([b for b in bookings if b["regNo"] == reg_no and b["resourceId"] == res_id and b["date"] == date_str and b["status"] == "active"])
            if user_hours >= 2:
                human_date = format_human_date(date_str)
                simple_res = res["name"].split("(")[0].strip()
                return self.send_json(422, {
                    "error": "LIMIT_EXCEEDED",
                    "message": f"You already have 2 hours booked on the {simple_res} for {human_date}. Cancel one to book another."
                })

            new_booking = {
                "id": f"bk_{int(datetime.now().timestamp()*1000)}",
                "resourceId": res_id,
                "date": date_str,
                "hour": hour,
                "name": name,
                "regNo": reg_no,
                "purpose": purpose,
                "status": "active",
                "createdAt": datetime.now().isoformat()
            }
            bookings.append(new_booking)
            return self.send_json(201, new_booking)

        # POST /api/reset
        if path == "/api/reset":
            bookings.clear()
            return self.send_json(200, {"message": "Database reset."})

        return self.send_json(404, {"error": "NOT_FOUND", "message": "Endpoint not found"})

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        path = parsed.path

        if path.startswith("/api/bookings/"):
            booking_id = path.split("/")[3]
            booking = next((b for b in bookings if b["id"] == booking_id), None)
            if not booking:
                return self.send_json(404, {"error": "NOT_FOUND", "message": f"Booking '{booking_id}' not found."})

            booking["status"] = "cancelled"
            return self.send_json(200, {"message": "Booking cancelled successfully. Slot freed."})

        return self.send_json(404, {"error": "NOT_FOUND", "message": "Endpoint not found"})

if __name__ == "__main__":
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    with socketserver.TCPServer(("", PORT), SlotSyncHandler) as httpd:
        print(f"SlotSync Python Server running on port {PORT}")
        httpd.serve_forever()
