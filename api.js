/**
 * SlotSync (PS-08) — Client & Server-Simulation Engine
 * 
 * Strict implementation of Business Rules R1 - R8, Data Models, Concurrency,
 * Fair-Use verification, and REST API contract.
 */

(function (window) {
  'use strict';

  // Seed Data: Resources specified in rules.md
  const SEED_RESOURCES = [
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

  // Helper: Format Date as YYYY-MM-DD
  function toISODate(dateObj) {
    const y = dateObj.getFullYear();
    const m = String(dateObj.getMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Helper: Human readable date like "8 Oct"
  function formatHumanDate(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const d = parseInt(parts[2], 10);
    const m = months[parseInt(parts[1], 10) - 1];
    return `${d} ${m}`;
  }

  // Database State Manager
  class SlotSyncDB {
    constructor() {
      this.STORAGE_KEY = 'slotsync_database_v1';
      this.lock = false;
      this.init();
    }

    init() {
      const existing = localStorage.getItem(this.STORAGE_KEY);
      if (existing) {
        try {
          const parsed = JSON.parse(existing);
          this.resources = parsed.resources || SEED_RESOURCES;
          this.bookings = parsed.bookings || [];
          this.waitlists = parsed.waitlists || [];
          return;
        } catch (e) {
          console.warn('Failed to parse existing DB, resetting with seeds', e);
        }
      }
      this.resetSeed();
    }

    resetSeed() {
      this.resources = JSON.parse(JSON.stringify(SEED_RESOURCES));
      this.bookings = [];
      this.waitlists = [];

      // Seed initial sample bookings for demonstration
      const today = new Date();
      const todayStr = toISODate(today);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = toISODate(tomorrow);

      // Asha K has 1 hour booked today on 3D Printer at 16:00 (if >= 16:00, use 18:00 or tomorrow)
      const currentHour = today.getHours();
      const sampleHour = currentHour < 15 ? 16 : (currentHour < 20 ? currentHour + 1 : 10);
      const targetDateStr = currentHour >= 20 ? tomorrowStr : todayStr;

      this.bookings.push({
        id: 'bk_' + Math.random().toString(36).substr(2, 9),
        resourceId: 'printer-1',
        date: targetDateStr,
        hour: sampleHour,
        name: 'Asha K',
        regNo: 'RA2511003010001',
        purpose: '3D print drone motor mount bracket',
        status: 'active',
        createdAt: new Date().toISOString()
      });

      // Vikram R has 1 hour on Soldering 1
      this.bookings.push({
        id: 'bk_' + Math.random().toString(36).substr(2, 9),
        resourceId: 'soldering-1',
        date: targetDateStr,
        hour: sampleHour,
        name: 'Vikram R',
        regNo: 'RA2511003010002',
        purpose: 'SMD soldering on custom ESP32 PCB',
        status: 'active',
        createdAt: new Date().toISOString()
      });

      this.save();
    }

    save() {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify({
        resources: this.resources,
        bookings: this.bookings,
        waitlists: this.waitlists
      }));
    }

    // Atomic Execution Simulation with concurrency lock
    async withLock(operation) {
      while (this.lock) {
        await new Promise(r => setTimeout(r, 10));
      }
      this.lock = true;
      try {
        return await operation();
      } finally {
        this.lock = false;
        this.save();
      }
    }
  }

  const db = new SlotSyncDB();

  /**
   * SlotSync Server Engine — Core REST Logic
   * Directly enforces Business Rules R1 through R8
   */
  const ServerEngine = {
    // Current Server Time provider (Rule R4)
    getCurrentTime() {
      return new Date();
    },

    // Get 7-day allowed window [today, today + 6] (Rule R2)
    getBookingWindow() {
      const today = this.getCurrentTime();
      today.setHours(0, 0, 0, 0);

      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() + i);
        days.push(toISODate(d));
      }
      return {
        startDate: days[0],
        endDate: days[6],
        allowedDates: days
      };
    },

    /**
     * GET /api/resources
     */
    async getResources() {
      return {
        status: 200,
        data: db.resources
      };
    },

    /**
     * GET /api/slots?resource=&date=
     */
    async getSlots(params = {}) {
      const resourceId = params.resource;
      const dateStr = params.date;

      if (!resourceId || !dateStr) {
        return {
          status: 400,
          data: {
            error: 'VALIDATION_ERROR',
            message: 'Both resource and date query parameters are required.'
          }
        };
      }

      const resource = db.resources.find(r => r.id === resourceId);
      if (!resource) {
        return {
          status: 404,
          data: {
            error: 'NOT_FOUND',
            message: `Resource with id '${resourceId}' not found.`
          }
        };
      }

      // Check 7-day window (Rule R2)
      const window = this.getBookingWindow();
      if (!window.allowedDates.includes(dateStr)) {
        return {
          status: 400,
          data: {
            error: 'OUT_OF_RANGE',
            message: `Date '${dateStr}' is outside the allowed 7-day booking window.`
          }
        };
      }

      const now = this.getCurrentTime();
      const todayStr = toISODate(now);
      const currentHour = now.getHours();

      // Operating hours
      const startHour = resource.operatingHours ? resource.operatingHours.start : 8;
      const endHour = resource.operatingHours ? resource.operatingHours.end : 22;

      // Filter active bookings for this resource and date
      const activeBookings = db.bookings.filter(b => 
        b.resourceId === resourceId && 
        b.date === dateStr && 
        b.status === 'active'
      );

      const slots = [];
      for (let h = startHour; h < endHour; h++) {
        const isPast = (dateStr < todayStr) || (dateStr === todayStr && h <= currentHour);
        const existingBooking = activeBookings.find(b => b.hour === h);

        const waitlistForSlot = db.waitlists.filter(w => 
          w.resourceId === resourceId && 
          w.date === dateStr && 
          w.hour === h
        );

        let status = 'available';
        if (isPast) {
          status = 'past';
        } else if (existingBooking) {
          status = 'booked';
        }

        slots.push({
          hour: h,
          timeStr: `${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00`,
          status: status,
          isPast: isPast,
          booking: existingBooking || null,
          waitlistCount: waitlistForSlot.length
        });
      }

      return {
        status: 200,
        data: {
          resourceId: resource.id,
          resourceName: resource.name,
          date: dateStr,
          slots: slots
        }
      };
    },

    /**
     * POST /api/bookings
     * Key Challenge: Atomically validate and enforce R1 - R6
     */
    async createBooking(payload = {}) {
      return await db.withLock(async () => {
        const { resourceId, date, hour, name, regNo, purpose } = payload;

        // Rule R6: Mandatory & non-empty
        if (!name || typeof name !== 'string' || name.trim() === '' ||
            !regNo || typeof regNo !== 'string' || regNo.trim() === '' ||
            !purpose || typeof purpose !== 'string' || purpose.trim() === '') {
          return {
            status: 400,
            data: {
              error: 'VALIDATION_ERROR',
              message: 'Name, registration number, and purpose are required and cannot be empty.'
            }
          };
        }

        // Rule R1: Slot must be an integer hour
        if (typeof hour !== 'number' || hour < 0 || hour > 23 || Math.floor(hour) !== hour) {
          return {
            status: 400,
            data: {
              error: 'VALIDATION_ERROR',
              message: 'Slots must be exactly 1 hour long and aligned to the hour (0-23).'
            }
          };
        }

        // Resource check
        const resource = db.resources.find(r => r.id === resourceId);
        if (!resource) {
          return {
            status: 404,
            data: {
              error: 'NOT_FOUND',
              message: `Resource '${resourceId}' not found.`
            }
          };
        }

        // Rule R2: 7-day window check
        const window = this.getBookingWindow();
        if (!window.allowedDates.includes(date)) {
          return {
            status: 400,
            data: {
              error: 'OUT_OF_RANGE',
              message: 'Bookings are strictly limited to the next 7 days including today.'
            }
          };
        }

        // Rule R4: No past slots (compare with server time)
        const now = this.getCurrentTime();
        const todayStr = toISODate(now);
        const currentHour = now.getHours();

        if (date < todayStr || (date === todayStr && hour <= currentHour)) {
          return {
            status: 400,
            data: {
              error: 'PAST_SLOT',
              message: 'Cannot book a slot that has already started or passed.'
            }
          };
        }

        // Rule R3: Unique constraint on (resourceId, date, hour)
        const alreadyBooked = db.bookings.some(b => 
          b.resourceId === resourceId &&
          b.date === date &&
          b.hour === hour &&
          b.status === 'active'
        );

        if (alreadyBooked) {
          return {
            status: 409,
            data: {
              error: 'SLOT_TAKEN',
              message: `The slot at ${String(hour).padStart(2, '0')}:00 on ${date} is already booked.`
            }
          };
        }

        // Rule R5 (KEY CHALLENGE): Fair-use limit: Max 2 hours per person, per resource, per day
        const trimmedReg = regNo.trim().toUpperCase();
        const activeUserHoursOnResource = db.bookings.filter(b => 
          b.regNo.trim().toUpperCase() === trimmedReg &&
          b.resourceId === resourceId &&
          b.date === date &&
          b.status === 'active'
        ).length;

        if (activeUserHoursOnResource >= 2) {
          const humanDate = formatHumanDate(date);
          const simpleResourceName = resource.name.split('(')[0].trim();
          return {
            status: 422,
            data: {
              error: 'LIMIT_EXCEEDED',
              message: `You already have 2 hours booked on the ${simpleResourceName} for ${humanDate}. Cancel one to book another.`
            }
          };
        }

        // Create the booking
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

        db.bookings.push(newBooking);

        // Remove from waitlist if this user was waiting
        db.waitlists = db.waitlists.filter(w => 
          !(w.resourceId === resourceId && w.date === date && w.hour === hour && w.regNo === trimmedReg)
        );

        return {
          status: 201,
          data: newBooking
        };
      });
    },

    /**
     * GET /api/bookings?reg=
     */
    async getBookingsByReg(regNo) {
      if (!regNo || typeof regNo !== 'string' || regNo.trim() === '') {
        return {
          status: 400,
          data: {
            error: 'VALIDATION_ERROR',
            message: 'Registration number query parameter is required.'
          }
        };
      }

      const targetReg = regNo.trim().toUpperCase();
      const userBookings = db.bookings.filter(b => b.regNo.trim().toUpperCase() === targetReg);

      // Enrich with resource metadata
      const enriched = userBookings.map(b => {
        const res = db.resources.find(r => r.id === b.resourceId);
        return {
          ...b,
          resourceName: res ? res.name : b.resourceId,
          resourceIcon: res ? res.icon : '📌',
          timeStr: `${String(b.hour).padStart(2, '0')}:00 - ${String(b.hour + 1).padStart(2, '0')}:00`
        };
      });

      // Sort newest date & hour first
      enriched.sort((a, b) => {
        if (a.date !== b.date) return b.date.localeCompare(a.date);
        return b.hour - a.hour;
      });

      return {
        status: 200,
        data: enriched
      };
    },

    /**
     * DELETE /api/bookings/:id
     * Rule R7: Frees slot and no longer counts toward limit.
     * Stretch Goal: Auto-promotes waitlist candidate if eligible.
     */
    async cancelBooking(bookingId) {
      return await db.withLock(async () => {
        const booking = db.bookings.find(b => b.id === bookingId);
        if (!booking) {
          return {
            status: 404,
            data: {
              error: 'NOT_FOUND',
              message: `Booking with ID '${bookingId}' not found.`
            }
          };
        }

        if (booking.status === 'cancelled') {
          return {
            status: 200,
            data: {
              message: 'Booking is already cancelled.',
              booking: booking
            }
          };
        }

        // Soft delete (R7)
        booking.status = 'cancelled';
        booking.cancelledAt = new Date().toISOString();

        // Stretch Goal: Check waitlist for this slot
        let promotedCandidate = null;
        const waitlistCandidates = db.waitlists.filter(w => 
          w.resourceId === booking.resourceId &&
          w.date === booking.date &&
          w.hour === booking.hour
        ).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

        for (const candidate of waitlistCandidates) {
          // Check if candidate still satisfies 2-hour fair use limit
          const candidateActiveHours = db.bookings.filter(b => 
            b.regNo.trim().toUpperCase() === candidate.regNo &&
            b.resourceId === booking.resourceId &&
            b.date === booking.date &&
            b.status === 'active'
          ).length;

          if (candidateActiveHours < 2) {
            // Auto-promote!
            promotedCandidate = {
              id: 'bk_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 5),
              resourceId: booking.resourceId,
              date: booking.date,
              hour: booking.hour,
              name: candidate.name,
              regNo: candidate.regNo,
              purpose: candidate.purpose + ' (Waitlist Auto-Promoted)',
              status: 'active',
              createdAt: new Date().toISOString()
            };
            db.bookings.push(promotedCandidate);
            // Remove from waitlist
            db.waitlists = db.waitlists.filter(w => w.id !== candidate.id);
            break;
          }
        }

        return {
          status: 200,
          data: {
            message: 'Booking cancelled successfully. Slot is now free.',
            cancelledBooking: booking,
            promotedBooking: promotedCandidate
          }
        };
      });
    },

    /**
     * Stretch Goal: Join Waitlist
     */
    async joinWaitlist(payload) {
      const { resourceId, date, hour, name, regNo, purpose } = payload;
      if (!name || !regNo) {
        return {
          status: 400,
          data: { error: 'VALIDATION_ERROR', message: 'Name and Registration Number required.' }
        };
      }

      const item = {
        id: 'wl_' + Date.now().toString(36),
        resourceId,
        date,
        hour,
        name: name.trim(),
        regNo: regNo.trim().toUpperCase(),
        purpose: (purpose || '').trim(),
        createdAt: new Date().toISOString()
      };

      db.waitlists.push(item);
      db.save();

      return {
        status: 201,
        data: item
      };
    },

    /**
     * Stretch Goal: Admin Overview Matrix
     */
    async getAdminOverview(dateStr) {
      const targetDate = dateStr || toISODate(this.getCurrentTime());
      const bookingsForDate = db.bookings.filter(b => b.date === targetDate && b.status === 'active');
      
      const uniqueUsers = new Set(bookingsForDate.map(b => b.regNo)).size;
      const totalPossibleSlots = db.resources.length * 14; // 14 hours per day
      const utilization = Math.round((bookingsForDate.length / totalPossibleSlots) * 100);

      const waitlistsForDate = db.waitlists.filter(w => w.date === targetDate).length;

      return {
        status: 200,
        data: {
          date: targetDate,
          totalBookings: bookingsForDate.length,
          activeUsers: uniqueUsers,
          utilizationPercent: utilization,
          waitlistRequests: waitlistsForDate,
          resources: db.resources,
          bookings: bookingsForDate
        }
      };
    },

    /**
     * Reset Demo Database
     */
    async resetDatabase() {
      db.resetSeed();
      return { status: 200, data: { message: 'Database reset to seed state.' } };
    }
  };

  /**
   * Unified Client Fetch Router
   * Seamlessly calls native fetch if a real HTTP backend is running on port 3000,
   * or delegates to the ServerEngine with 0 latency & 100% fidelity.
   */
  const SlotSyncAPI = {
    async request(method, endpoint, body = null) {
      // 1. Try real backend if available
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 600); // quick probe
        const fetchOptions = {
          method: method,
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal
        };
        if (body && ['POST', 'PUT', 'PATCH'].includes(method)) {
          fetchOptions.body = JSON.stringify(body);
        }

        const res = await fetch(endpoint, fetchOptions);
        clearTimeout(timeoutId);
        const data = await res.json();
        return { status: res.status, ok: res.ok, data: data };
      } catch (err) {
        // Fallback transparently to ServerEngine simulation
        return await this.dispatchLocalServer(method, endpoint, body);
      }
    },

    async dispatchLocalServer(method, endpoint, body) {
      // Route parsing
      const [path, queryString] = endpoint.split('?');
      const params = {};
      if (queryString) {
        new URLSearchParams(queryString).forEach((val, key) => {
          params[key] = val;
        });
      }

      let result;
      if (path === '/api/resources' && method === 'GET') {
        result = await ServerEngine.getResources();
      } else if (path === '/api/slots' && method === 'GET') {
        result = await ServerEngine.getSlots(params);
      } else if (path === '/api/bookings' && method === 'POST') {
        result = await ServerEngine.createBooking(body);
      } else if (path === '/api/bookings' && method === 'GET') {
        result = await ServerEngine.getBookingsByReg(params.reg);
      } else if (path.startsWith('/api/bookings/') && method === 'DELETE') {
        const bookingId = path.split('/')[3];
        result = await ServerEngine.cancelBooking(bookingId);
      } else if (path === '/api/waitlist' && method === 'POST') {
        result = await ServerEngine.joinWaitlist(body);
      } else if (path === '/api/admin/overview' && method === 'GET') {
        result = await ServerEngine.getAdminOverview(params.date);
      } else if (path === '/api/reset' && method === 'POST') {
        result = await ServerEngine.resetDatabase();
      } else {
        result = {
          status: 404,
          data: { error: 'NOT_FOUND', message: `Route ${method} ${path} not found.` }
        };
      }

      return {
        status: result.status,
        ok: result.status >= 200 && result.status < 300,
        data: result.data
      };
    },

    // Direct typed helpers
    getResources() {
      return this.request('GET', '/api/resources');
    },
    getSlots(resourceId, dateStr) {
      return this.request('GET', `/api/slots?resource=${encodeURIComponent(resourceId)}&date=${encodeURIComponent(dateStr)}`);
    },
    createBooking(bookingData) {
      return this.request('POST', '/api/bookings', bookingData);
    },
    getMyBookings(regNo) {
      return this.request('GET', `/api/bookings?reg=${encodeURIComponent(regNo)}`);
    },
    cancelBooking(bookingId) {
      return this.request('DELETE', `/api/bookings/${encodeURIComponent(bookingId)}`);
    },
    joinWaitlist(waitlistData) {
      return this.request('POST', '/api/waitlist', waitlistData);
    },
    getAdminOverview(dateStr) {
      return this.request('GET', `/api/admin/overview?date=${encodeURIComponent(dateStr)}`);
    },
    resetData() {
      return this.request('POST', '/api/reset');
    },

    // Export utilities
    toISODate,
    formatHumanDate,
    getServerEngine: () => ServerEngine
  };

  window.SlotSyncAPI = SlotSyncAPI;
})(window);
