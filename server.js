/**
 * SlotSync (PS-08) — Node.js / Express REST API Server
 * 
 * Strict enforcement of:
 * - R1: 1-hour slots aligned to the hour
 * - R2: Next 7 days window (including today)
 * - R3: Single active booking per slot (unique constraint)
 * - R4: No past slots (server time comparison)
 * - R5: Fair-use limit: max 2 active hours per person, per resource, per day
 * - R6: Required name, regNo, purpose
 * - R7: Cancel frees slot and restores limit
 * - R8: Identification via registration number (no auth required)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;

// Seed Resources
const RESOURCES = [
  {
    id: 'printer-1',
    name: '3D Printer (Ultimaker S5)',
    type: '3D Printer',
    desc: 'Dual-extrusion industrial FDM printer with 0.4mm nozzle for precision enclosures and parts.',
    icon: '🖨️',
    operatingHours: { start: 8, end: 22 }
  },
  {
    id: 'soldering-1',
    name: 'Soldering Station 1 (Weller)',
    type: 'Soldering',
    desc: 'Weller WT1010 high-precision temperature-controlled ESD-safe soldering setup.',
    icon: '⚡',
    operatingHours: { start: 8, end: 22 }
  },
  {
    id: 'soldering-2',
    name: 'Soldering Station 2 (Hakko)',
    type: 'Soldering',
    desc: 'Hakko FX-888D thermal workstation with activated carbon fume extraction.',
    icon: '🔥',
    operatingHours: { start: 8, end: 22 }
  },
  {
    id: 'lab-room',
    name: 'Lab Room (Collaborative Bench)',
    type: 'Lab Space',
    desc: 'Shared hardware development bench with oscilloscope, DC power supplies & multimeter.',
    icon: '🔬',
    operatingHours: { start: 8, end: 22 }
  }
];

// In-Memory Database
let bookings = [];
let waitlists = [];

function toISODate(d) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHumanDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]}`;
}

function getBookingWindow() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    days.push(toISODate(d));
  }
  return days;
}

// Seed initial bookings
function seedInitialData() {
  const today = new Date();
  const todayStr = toISODate(today);
  const currentHour = today.getHours();
  const targetHour = currentHour < 18 ? currentHour + 2 : 10;
  const targetDate = currentHour >= 18 ? toISODate(new Date(Date.now() + 86400000)) : todayStr;

  bookings = [
    {
      id: 'bk_' + Math.random().toString(36).substr(2, 9),
      resourceId: 'printer-1',
      date: targetDate,
      hour: targetHour,
      name: 'Asha K',
      regNo: 'RA2511003010001',
      purpose: 'Print enclosure for sensor project',
      status: 'active',
      createdAt: new Date().toISOString()
    }
  ];
}
seedInitialData();

// HTTP Request Handler
const server = http.createServer((req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const pathname = urlObj.pathname;
  const searchParams = urlObj.searchParams;

  // Static File Serving
  if (req.method === 'GET' && (pathname === '/' || !pathname.startsWith('/api/'))) {
    const filePath = pathname === '/' ? path.join(__dirname, 'index.html') : path.join(__dirname, pathname);
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('File Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      let contentType = 'text/plain';
      if (ext === '.html') contentType = 'text/html';
      else if (ext === '.css') contentType = 'text/css';
      else if (ext === '.js') contentType = 'application/javascript';
      else if (ext === '.json') contentType = 'application/json';
      
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(data);
    });
    return;
  }

  // JSON helper
  const sendJSON = (statusCode, data) => {
    res.writeHead(statusCode, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  };

  // 1. GET /api/resources
  if (req.method === 'GET' && pathname === '/api/resources') {
    return sendJSON(200, RESOURCES);
  }

  // 2. GET /api/slots?resource=&date=
  if (req.method === 'GET' && pathname === '/api/slots') {
    const resourceId = searchParams.get('resource');
    const dateStr = searchParams.get('date');

    if (!resourceId || !dateStr) {
      return sendJSON(400, { error: 'VALIDATION_ERROR', message: 'Resource and date query params required.' });
    }

    const resource = RESOURCES.find(r => r.id === resourceId);
    if (!resource) {
      return sendJSON(404, { error: 'NOT_FOUND', message: `Resource '${resourceId}' not found.` });
    }

    const allowedDates = getBookingWindow();
    if (!allowedDates.includes(dateStr)) {
      return sendJSON(400, { error: 'OUT_OF_RANGE', message: 'Date is outside the 7-day booking window.' });
    }

    const now = new Date();
    const todayStr = toISODate(now);
    const currentHour = now.getHours();

    const activeBookings = bookings.filter(b => b.resourceId === resourceId && b.date === dateStr && b.status === 'active');

    const slots = [];
    for (let h = 8; h < 22; h++) {
      const isPast = (dateStr < todayStr) || (dateStr === todayStr && h <= currentHour);
      const existing = activeBookings.find(b => b.hour === h);

      slots.push({
        hour: h,
        timeStr: `${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00`,
        status: isPast ? 'past' : (existing ? 'booked' : 'available'),
        isPast,
        booking: existing || null
      });
    }

    return sendJSON(200, {
      resourceId,
      resourceName: resource.name,
      date: dateStr,
      slots
    });
  }

  // 3. POST /api/bookings
  if (req.method === 'POST' && pathname === '/api/bookings') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      let payload;
      try {
        payload = JSON.parse(body);
      } catch (e) {
        return sendJSON(400, { error: 'VALIDATION_ERROR', message: 'Invalid JSON body.' });
      }

      const { resourceId, date, hour, name, regNo, purpose } = payload;

      // R6: Non-empty required
      if (!name || !name.trim() || !regNo || !regNo.trim() || !purpose || !purpose.trim()) {
        return sendJSON(400, { error: 'VALIDATION_ERROR', message: 'Name, registration number, and purpose are required and cannot be empty.' });
      }

      // R1: 1-hour slot
      if (typeof hour !== 'number' || hour < 0 || hour > 23 || Math.floor(hour) !== hour) {
        return sendJSON(400, { error: 'VALIDATION_ERROR', message: 'Slots must be exactly 1 hour long and aligned to the hour.' });
      }

      const resource = RESOURCES.find(r => r.id === resourceId);
      if (!resource) {
        return sendJSON(404, { error: 'NOT_FOUND', message: 'Resource not found.' });
      }

      // R2: 7-day window
      const allowedDates = getBookingWindow();
      if (!allowedDates.includes(date)) {
        return sendJSON(400, { error: 'OUT_OF_RANGE', message: 'Bookings must be within the next 7 days.' });
      }

      // R4: No past slots
      const now = new Date();
      const todayStr = toISODate(now);
      const currentHour = now.getHours();
      if (date < todayStr || (date === todayStr && hour <= currentHour)) {
        return sendJSON(400, { error: 'PAST_SLOT', message: 'Cannot book a slot that has already started or passed.' });
      }

      // R3: Unique constraint
      const alreadyBooked = bookings.some(b => b.resourceId === resourceId && b.date === date && b.hour === hour && b.status === 'active');
      if (alreadyBooked) {
        return sendJSON(409, { error: 'SLOT_TAKEN', message: `Slot is already booked for this hour.` });
      }

      // R5: Fair-use limit (Key Challenge)
      const trimmedReg = regNo.trim().toUpperCase();
      const activeUserHours = bookings.filter(b => b.regNo.trim().toUpperCase() === trimmedReg && b.resourceId === resourceId && b.date === date && b.status === 'active').length;

      if (activeUserHours >= 2) {
        const humanDate = formatHumanDate(date);
        const simpleName = resource.name.split('(')[0].trim();
        return sendJSON(422, {
          error: 'LIMIT_EXCEEDED',
          message: `You already have 2 hours booked on the ${simpleName} for ${humanDate}. Cancel one to book another.`
        });
      }

      const newBooking = {
        id: 'bk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
        resourceId,
        date,
        hour,
        name: name.trim(),
        regNo: trimmedReg,
        purpose: purpose.trim(),
        status: 'active',
        createdAt: new Date().toISOString()
      };

      bookings.push(newBooking);
      return sendJSON(201, newBooking);
    });
    return;
  }

  // 4. GET /api/bookings?reg=
  if (req.method === 'GET' && pathname === '/api/bookings') {
    const regNo = searchParams.get('reg');
    if (!regNo) {
      return sendJSON(400, { error: 'VALIDATION_ERROR', message: 'Registration number query param required.' });
    }

    const trimmed = regNo.trim().toUpperCase();
    const userBookings = bookings.filter(b => b.regNo.trim().toUpperCase() === trimmed).map(b => {
      const resMeta = RESOURCES.find(r => r.id === b.resourceId);
      return {
        ...b,
        resourceName: resMeta ? resMeta.name : b.resourceId,
        resourceIcon: resMeta ? resMeta.icon : '📌',
        timeStr: `${String(b.hour).padStart(2, '0')}:00 - ${String(b.hour + 1).padStart(2, '0')}:00`
      };
    });

    return sendJSON(200, userBookings);
  }

  // 5. DELETE /api/bookings/:id
  if (req.method === 'DELETE' && pathname.startsWith('/api/bookings/')) {
    const bookingId = pathname.split('/')[3];
    const booking = bookings.find(b => b.id === bookingId);

    if (!booking) {
      return sendJSON(404, { error: 'NOT_FOUND', message: `Booking '${bookingId}' not found.` });
    }

    booking.status = 'cancelled';
    booking.cancelledAt = new Date().toISOString();

    return sendJSON(200, {
      message: 'Booking cancelled successfully. Slot freed.',
      cancelledBooking: booking
    });
  }

  // 6. POST /api/reset
  if (req.method === 'POST' && pathname === '/api/reset') {
    seedInitialData();
    return sendJSON(200, { message: 'Database reset.' });
  }

  return sendJSON(404, { error: 'NOT_FOUND', message: 'Endpoint not found.' });
});

server.listen(PORT, () => {
  console.log(`SlotSync server running at http://localhost:${PORT}`);
});
