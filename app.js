/**
 * SlotSync (PS-08) — Interactive Application Controller
 * Handles UI state, 7-day navigation, booking workflows, quota meters,
 * cancellations, and real-time synchronization.
 */

(function () {
  'use strict';

  // Application State
  const state = {
    currentTab: 'grid',
    currentUser: {
      name: 'Asha K',
      regNo: 'RA2511003010001'
    },
    resources: [],
    selectedResourceId: 'printer-1',
    selectedDate: null,
    sevenDays: [],
    currentSlotToBook: null,
    myBookings: []
  };

  // DOM Elements Cache
  const elements = {};

  // Initialize
  document.addEventListener('DOMContentLoaded', async () => {
    cacheDomElements();
    initCurrentUser();
    initDateWindow();
    setupNavigation();
    setupModals();
    setupMyBookingsSearch();
    setupAdminDate();

    // Fetch initial resources and load grid
    await loadResources();
    await refreshGrid();
    await refreshMyBookings();
  });

  function cacheDomElements() {
    elements.navTabs = document.querySelectorAll('.nav-tab');
    elements.tabPanels = document.querySelectorAll('.tab-panel');
    elements.resourcePills = document.getElementById('resourcePills');
    elements.datePillGroup = document.getElementById('datePillGroup');
    elements.slotsGrid = document.getElementById('slotsGrid');
    elements.btnRefreshGrid = document.getElementById('btnRefreshGrid');
    
    // User profile elements
    elements.userProfileBadge = document.getElementById('userProfileBadge');
    elements.currentUserName = document.getElementById('currentUserName');
    elements.currentUserReg = document.getElementById('currentUserReg');
    elements.userAvatarText = document.getElementById('userAvatarText');
    elements.btnSwitchUser = document.getElementById('btnSwitchUser');
    elements.userSwitchModal = document.getElementById('userSwitchModal');
    elements.btnCloseSwitchModal = document.getElementById('btnCloseSwitchModal');
    elements.btnCancelSwitchModal = document.getElementById('btnCancelSwitchModal');
    elements.btnSaveSwitchUser = document.getElementById('btnSaveSwitchUser');
    elements.quickSelectUser = document.getElementById('quickSelectUser');
    elements.customUserName = document.getElementById('customUserName');
    elements.customUserReg = document.getElementById('customUserReg');

    // Quota meter elements
    elements.quotaDateLabel = document.getElementById('quotaDateLabel');
    elements.quotaResourceLabel = document.getElementById('quotaResourceLabel');
    elements.quotaFraction = document.getElementById('quotaFraction');
    elements.quotaBarFill = document.getElementById('quotaBarFill');
    elements.quotaStatusText = document.getElementById('quotaStatusText');

    // Resource detail banner
    elements.resourceIcon = document.getElementById('resourceIcon');
    elements.selectedResourceTitle = document.getElementById('selectedResourceTitle');
    elements.selectedResourceDesc = document.getElementById('selectedResourceDesc');
    elements.statFreeToday = document.getElementById('statFreeToday');
    elements.statBookedToday = document.getElementById('statBookedToday');
    elements.gridDisplayTitle = document.getElementById('gridDisplayTitle');

    // Booking modal elements
    elements.bookingModal = document.getElementById('bookingModal');
    elements.btnCloseModal = document.getElementById('btnCloseModal');
    elements.btnCancelModal = document.getElementById('btnCancelModal');
    elements.bookingForm = document.getElementById('bookingForm');
    elements.modalResourceVal = document.getElementById('modalResourceVal');
    elements.modalDateVal = document.getElementById('modalDateVal');
    elements.modalTimeVal = document.getElementById('modalTimeVal');
    elements.inputName = document.getElementById('inputName');
    elements.inputRegNo = document.getElementById('inputRegNo');
    elements.inputPurpose = document.getElementById('inputPurpose');
    elements.modalErrorAlert = document.getElementById('modalErrorAlert');
    elements.modalErrorMsg = document.getElementById('modalErrorMsg');

    // My Bookings Tab
    elements.inputLookupReg = document.getElementById('inputLookupReg');
    elements.btnLookupBookings = document.getElementById('btnLookupBookings');
    elements.myBookingsContainer = document.getElementById('myBookingsContainer');
    elements.historyBookingsContainer = document.getElementById('historyBookingsContainer');
    elements.bookingsListTitle = document.getElementById('bookingsListTitle');
    elements.activeBookingsCount = document.getElementById('activeBookingsCount');
    elements.cancelledCount = document.getElementById('cancelledCount');
    elements.myBookingsBadge = document.getElementById('myBookingsBadge');

    // Admin Tab
    elements.adminSelectDate = document.getElementById('adminSelectDate');
    elements.adminTotalBooked = document.getElementById('adminTotalBooked');
    elements.adminActiveUsers = document.getElementById('adminActiveUsers');
    elements.adminUtilization = document.getElementById('adminUtilization');
    elements.adminWaitlistCount = document.getElementById('adminWaitlistCount');
    elements.adminMatrixTable = document.getElementById('adminMatrixTable');

    // Toasts
    elements.toastContainer = document.getElementById('toastContainer');
  }

  // User Profile
  function initCurrentUser() {
    const saved = localStorage.getItem('slotsync_active_user');
    if (saved) {
      try {
        state.currentUser = JSON.parse(saved);
      } catch (e) {}
    }
    updateUserBadgeDisplay();
  }

  function updateUserBadgeDisplay() {
    elements.currentUserName.textContent = state.currentUser.name;
    elements.currentUserReg.textContent = state.currentUser.regNo;
    const initials = state.currentUser.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    elements.userAvatarText.textContent = initials || 'ST';
    localStorage.setItem('slotsync_active_user', JSON.stringify(state.currentUser));
  }

  // 7-Day Window (Rule R2)
  function initDateWindow() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    state.sevenDays = [];
    const daysOfWeek = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const iso = SlotSyncAPI.toISODate(d);
      state.sevenDays.push({
        iso: iso,
        dayName: i === 0 ? 'Today' : (i === 1 ? 'Tomorrow' : daysOfWeek[d.getDay()]),
        dayNum: d.getDate(),
        month: months[d.getMonth()]
      });
    }

    state.selectedDate = state.sevenDays[0].iso;
    renderDatePills();
  }

  function renderDatePills() {
    elements.datePillGroup.innerHTML = '';
    state.sevenDays.forEach(day => {
      const pill = document.createElement('div');
      pill.className = `date-pill ${day.iso === state.selectedDate ? 'active' : ''}`;
      pill.dataset.date = day.iso;
      pill.innerHTML = `
        <span class="date-pill-day">${day.dayName}</span>
        <span class="date-pill-date">${day.dayNum}</span>
        <span class="date-pill-month">${day.month}</span>
      `;
      pill.addEventListener('click', () => {
        state.selectedDate = day.iso;
        document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        refreshGrid();
      });
      elements.datePillGroup.appendChild(pill);
    });
  }

  // Navigation Tabs Setup
  function setupNavigation() {
    elements.navTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const tabTarget = tab.dataset.tab;
        switchTab(tabTarget);
      });
    });

    elements.btnRefreshGrid.addEventListener('click', async () => {
      elements.btnRefreshGrid.classList.add('rotating');
      await refreshGrid();
      setTimeout(() => elements.btnRefreshGrid.classList.remove('rotating'), 500);
      showToast('Grid Refreshed', 'Availability state is up to date with server.', 'info');
    });
  }

  function switchTab(tabId) {
    state.currentTab = tabId;
    elements.navTabs.forEach(t => {
      t.classList.toggle('active', t.dataset.tab === tabId);
    });

    elements.tabPanels.forEach(p => {
      p.classList.toggle('active', p.id === `tab${capitalize(tabId)}`);
    });

    if (tabId === 'grid') {
      refreshGrid();
    } else if (tabId === 'my-bookings') {
      refreshMyBookings();
    } else if (tabId === 'admin') {
      refreshAdminView();
    }
  }

  function capitalize(str) {
    return str.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join('');
  }

  // Fetch Resources (GET /api/resources)
  async function loadResources() {
    const res = await SlotSyncAPI.getResources();
    if (res.ok) {
      state.resources = res.data;
      renderResourcePills();
    } else {
      showToast('Error Loading Resources', res.data.message || 'Could not reach server', 'error');
    }
  }

  function renderResourcePills() {
    elements.resourcePills.innerHTML = '';
    state.resources.forEach(r => {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = `resource-pill ${r.id === state.selectedResourceId ? 'active' : ''}`;
      pill.dataset.id = r.id;
      pill.innerHTML = `
        <span class="resource-pill-icon">${r.icon}</span>
        <span>${r.name.split('(')[0].trim()}</span>
      `;
      pill.addEventListener('click', () => {
        state.selectedResourceId = r.id;
        document.querySelectorAll('.resource-pill').forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        refreshGrid();
      });
      elements.resourcePills.appendChild(pill);
    });
  }

  // Main Availability Grid Rendering (GET /api/slots?resource=&date=)
  async function refreshGrid() {
    const resource = state.resources.find(r => r.id === state.selectedResourceId);
    if (!resource) return;

    // Update banner metadata
    elements.resourceIcon.textContent = resource.icon;
    elements.selectedResourceTitle.textContent = resource.name;
    elements.selectedResourceDesc.textContent = resource.desc;

    const dayObj = state.sevenDays.find(d => d.iso === state.selectedDate);
    const dayLabel = dayObj ? `${dayObj.dayName}, ${dayObj.dayNum} ${dayObj.month}` : state.selectedDate;
    elements.gridDisplayTitle.textContent = `Hourly Slots for ${dayLabel}`;

    // Update Quota Meter labels
    elements.quotaDateLabel.textContent = dayObj ? dayObj.dayName : state.selectedDate;
    elements.quotaResourceLabel.textContent = resource.name.split('(')[0].trim();

    // Show loading skeleton
    elements.slotsGrid.innerHTML = `
      <div class="slots-loading">
        <div class="spinner"></div>
        <p>Checking server availability for ${resource.name}...</p>
      </div>
    `;

    const res = await SlotSyncAPI.getSlots(state.selectedResourceId, state.selectedDate);
    if (!res.ok) {
      elements.slotsGrid.innerHTML = `
        <div class="no-bookings-view">
          <p style="color: #fda4af;">Error loading slots: ${res.data.message || 'Server error'}</p>
        </div>
      `;
      return;
    }

    const slots = res.data.slots;
    renderSlots(slots, resource);
    updateQuotaMeter(slots, resource);
  }

  function renderSlots(slots, resource) {
    elements.slotsGrid.innerHTML = '';
    const myReg = state.currentUser.regNo.trim().toUpperCase();

    let freeCount = 0;
    let bookedCount = 0;

    slots.forEach(slot => {
      const isMine = slot.booking && slot.booking.regNo.trim().toUpperCase() === myReg;
      
      let stateClass = 'state-available';
      let badgeHtml = '<span class="slot-status-badge badge-available">Available</span>';

      if (slot.status === 'past') {
        stateClass = 'state-past';
        badgeHtml = '<span class="slot-status-badge badge-past">Past</span>';
      } else if (isMine) {
        stateClass = 'state-mine';
        badgeHtml = '<span class="slot-status-badge badge-mine">Mine</span>';
        bookedCount++;
      } else if (slot.status === 'booked') {
        stateClass = 'state-booked';
        badgeHtml = '<span class="slot-status-badge badge-booked">Booked</span>';
        bookedCount++;
      } else {
        freeCount++;
      }

      const card = document.createElement('div');
      card.className = `slot-card ${stateClass}`;
      card.dataset.hour = slot.hour;

      let bodyContent = '';
      let footerContent = '';

      if (slot.status === 'past') {
        bodyContent = `<p class="slot-purpose" style="color: #64748b;">Slot has already ended</p>`;
        footerContent = `<button class="btn btn-secondary" style="width: 100%; opacity: 0.5;" disabled>Unavailable</button>`;
      } else if (isMine) {
        bodyContent = `
          <div class="slot-user">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            ${slot.booking.name} (You)
          </div>
          <p class="slot-purpose" title="${slot.booking.purpose}">"${slot.booking.purpose}"</p>
        `;
        footerContent = `
          <button class="btn-cancel-slot" data-booking-id="${slot.booking.id}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            Cancel Booking
          </button>
        `;
      } else if (slot.status === 'booked') {
        // Mask other students' full registration number for privacy
        const maskedReg = slot.booking.regNo.slice(0, 4) + '•••' + slot.booking.regNo.slice(-3);
        bodyContent = `
          <div class="slot-user">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
            ${slot.booking.name} <span style="font-size: 0.72rem; color: #94a3b8;">(${maskedReg})</span>
          </div>
          <p class="slot-purpose">"${slot.booking.purpose}"</p>
        `;
        footerContent = `
          <button class="btn-waitlist" data-hour="${slot.hour}">
            Join Waitlist (${slot.waitlistCount || 0} waiting)
          </button>
        `;
      } else {
        bodyContent = `<p class="slot-purpose" style="color: #34d399;">Ready for reservation • 1-hour slot</p>`;
        footerContent = `
          <button class="btn-book-slot" data-hour="${slot.hour}">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
            Book This Slot
          </button>
        `;
      }

      card.innerHTML = `
        <div class="slot-top">
          <span class="slot-time">${slot.timeStr}</span>
          ${badgeHtml}
        </div>
        <div class="slot-body">
          ${bodyContent}
        </div>
        <div class="slot-footer">
          ${footerContent}
        </div>
      `;

      // Event listener for booking
      const bookBtn = card.querySelector('.btn-book-slot');
      if (bookBtn) {
        bookBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          openBookingModal(slot, resource);
        });
      }

      // Event listener for cancelling
      const cancelBtn = card.querySelector('.btn-cancel-slot');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleCancelBooking(slot.booking.id);
        });
      }

      // Event listener for waitlist
      const waitlistBtn = card.querySelector('.btn-waitlist');
      if (waitlistBtn) {
        waitlistBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleJoinWaitlist(slot, resource);
        });
      }

      elements.slotsGrid.appendChild(card);
    });

    elements.statFreeToday.textContent = freeCount;
    elements.statBookedToday.textContent = bookedCount;
  }

  // Fair-Use Quota Meter Calculation (Rule R5)
  function updateQuotaMeter(slots, resource) {
    const myReg = state.currentUser.regNo.trim().toUpperCase();
    const mineCount = slots.filter(s => s.booking && s.booking.regNo.trim().toUpperCase() === myReg).length;

    elements.quotaFraction.textContent = `${mineCount} / 2 hours`;
    const percent = Math.min(100, (mineCount / 2) * 100);
    elements.quotaBarFill.style.width = `${percent}%`;

    elements.quotaBarFill.className = 'quota-bar-fill';
    if (mineCount === 1) {
      elements.quotaBarFill.classList.add('warning');
      elements.quotaStatusText.textContent = '1 hour remaining for this equipment today.';
      elements.quotaStatusText.style.color = '#f59e0b';
    } else if (mineCount >= 2) {
      elements.quotaBarFill.classList.add('full');
      elements.quotaStatusText.textContent = 'Daily fair-use limit reached (2 hours). Cancel one to book another.';
      elements.quotaStatusText.style.color = '#f43f5e';
    } else {
      elements.quotaStatusText.textContent = '2 slots available today for your registration.';
      elements.quotaStatusText.style.color = '#10b981';
    }
  }

  // Booking Modal Flow
  function openBookingModal(slot, resource) {
    state.currentSlotToBook = slot;

    // Reset modal fields
    elements.modalErrorAlert.hidden = true;
    elements.modalResourceVal.textContent = resource.name;
    
    const dayObj = state.sevenDays.find(d => d.iso === state.selectedDate);
    elements.modalDateVal.textContent = dayObj ? `${dayObj.dayName}, ${dayObj.dayNum} ${dayObj.month}` : state.selectedDate;
    elements.modalTimeVal.textContent = slot.timeStr;

    // Pre-populate with current student profile
    elements.inputName.value = state.currentUser.name;
    elements.inputRegNo.value = state.currentUser.regNo;
    elements.inputPurpose.value = '';

    elements.bookingModal.hidden = false;
    setTimeout(() => elements.inputPurpose.focus(), 50);
  }

  function closeBookingModal() {
    elements.bookingModal.hidden = true;
    state.currentSlotToBook = null;
  }

  function setupModals() {
    elements.btnCloseModal.addEventListener('click', closeBookingModal);
    elements.btnCancelModal.addEventListener('click', closeBookingModal);

    elements.bookingForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleBookingSubmit();
    });

    // Profile switch modal
    elements.btnSwitchUser.addEventListener('click', () => {
      elements.quickSelectUser.value = state.currentUser.regNo;
      elements.customUserName.value = '';
      elements.customUserReg.value = '';
      elements.userSwitchModal.hidden = false;
    });

    elements.btnCloseSwitchModal.addEventListener('click', () => elements.userSwitchModal.hidden = true);
    elements.btnCancelSwitchModal.addEventListener('click', () => elements.userSwitchModal.hidden = true);

    elements.btnSaveSwitchUser.addEventListener('click', () => {
      if (elements.customUserName.value.trim() && elements.customUserReg.value.trim()) {
        state.currentUser = {
          name: elements.customUserName.value.trim(),
          regNo: elements.customUserReg.value.trim().toUpperCase()
        };
      } else {
        const selectedOpt = elements.quickSelectUser.options[elements.quickSelectUser.selectedIndex];
        state.currentUser = {
          name: selectedOpt.dataset.name,
          regNo: selectedOpt.value
        };
      }
      updateUserBadgeDisplay();
      elements.userSwitchModal.hidden = true;
      showToast('Active Profile Switched', `Now operating as ${state.currentUser.name} (${state.currentUser.regNo})`, 'info');
      refreshGrid();
      refreshMyBookings();
    });
  }

  // Handle Form Submission (POST /api/bookings)
  async function handleBookingSubmit() {
    if (!state.currentSlotToBook) return;

    const name = elements.inputName.value.trim();
    const regNo = elements.inputRegNo.value.trim();
    const purpose = elements.inputPurpose.value.trim();

    // Client hints
    if (!name || !regNo || !purpose) {
      elements.modalErrorAlert.hidden = false;
      elements.modalErrorMsg.textContent = 'All fields (Name, Registration Number, and Purpose) are required.';
      return;
    }

    const payload = {
      resourceId: state.selectedResourceId,
      date: state.selectedDate,
      hour: state.currentSlotToBook.hour,
      name: name,
      regNo: regNo,
      purpose: purpose
    };

    const submitBtn = document.getElementById('btnSubmitBooking');
    submitBtn.disabled = true;

    try {
      const res = await SlotSyncAPI.createBooking(payload);

      if (res.ok) {
        closeBookingModal();
        showToast('Slot Booked Successfully! (HTTP 201)', `Reserved ${elements.modalResourceVal.textContent} for ${res.data.date} at ${String(res.data.hour).padStart(2, '0')}:00`, 'success');
        await refreshGrid();
        await refreshMyBookings();
      } else {
        // Show server's error message verbatim to the user! (UI Rule)
        elements.modalErrorAlert.hidden = false;
        elements.modalErrorMsg.innerHTML = `<strong>Server Error (${res.status} ${res.data.error || ''}):</strong><br>${res.data.message}`;
      }
    } catch (err) {
      elements.modalErrorAlert.hidden = false;
      elements.modalErrorMsg.textContent = 'Network or simulation error: ' + err.message;
    } finally {
      submitBtn.disabled = false;
    }
  }

  // Cancel Booking (DELETE /api/bookings/:id)
  async function handleCancelBooking(bookingId) {
    if (!confirm('Are you sure you want to cancel this booking? This will immediately free the slot for other members.')) {
      return;
    }

    const res = await SlotSyncAPI.cancelBooking(bookingId);
    if (res.ok) {
      let toastMsg = 'Your booking has been cancelled and your 2-hour daily quota has been restored.';
      if (res.data.promotedBooking) {
        toastMsg += ` Auto-promoted waitlisted member: ${res.data.promotedBooking.name}!`;
      }
      showToast('Booking Cancelled (HTTP 200)', toastMsg, 'success');
      await refreshGrid();
      await refreshMyBookings();
    } else {
      showToast('Cancellation Failed', res.data.message || 'Error cancelling booking', 'error');
    }
  }

  // Join Waitlist (POST /api/waitlist)
  async function handleJoinWaitlist(slot, resource) {
    const purpose = prompt(`Join waitlist for ${resource.name} at ${slot.timeStr}.\nEnter your project purpose:`, 'Need for urgent prototype testing');
    if (purpose === null) return; // user cancelled

    const payload = {
      resourceId: resource.id,
      date: state.selectedDate,
      hour: slot.hour,
      name: state.currentUser.name,
      regNo: state.currentUser.regNo,
      purpose: purpose || 'Waitlist request'
    };

    const res = await SlotSyncAPI.joinWaitlist(payload);
    if (res.ok) {
      showToast('Joined Waitlist!', 'If the current booking is cancelled, you will be automatically booked (if within 2-hour limit).', 'info');
      refreshGrid();
    } else {
      showToast('Waitlist Error', res.data.message, 'error');
    }
  }

  // ==========================================
  // TAB 2: MY BOOKINGS (GET /api/bookings?reg=)
  // ==========================================
  function setupMyBookingsSearch() {
    elements.inputLookupReg.value = state.currentUser.regNo;

    elements.btnLookupBookings.addEventListener('click', () => {
      refreshMyBookings(elements.inputLookupReg.value.trim());
    });

    document.querySelectorAll('.quick-reg-tags .tag-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const reg = btn.dataset.reg;
        const name = btn.dataset.name;
        state.currentUser = { name, regNo: reg };
        updateUserBadgeDisplay();
        elements.inputLookupReg.value = reg;
        refreshMyBookings(reg);
        refreshGrid();
      });
    });
  }

  async function refreshMyBookings(regNoToSearch) {
    const reg = regNoToSearch || state.currentUser.regNo;
    elements.bookingsListTitle.textContent = `Active Bookings for ${state.currentUser.name} (${reg})`;

    const res = await SlotSyncAPI.getMyBookings(reg);
    if (!res.ok) {
      elements.myBookingsContainer.innerHTML = `
        <div class="no-bookings-view">
          <p style="color: #fda4af;">Error: ${res.data.message}</p>
        </div>
      `;
      return;
    }

    const allBookings = res.data;
    const activeBookings = allBookings.filter(b => b.status === 'active');
    const cancelledBookings = allBookings.filter(b => b.status === 'cancelled');

    elements.activeBookingsCount.textContent = `${activeBookings.length} active`;
    elements.myBookingsBadge.textContent = activeBookings.length;
    elements.cancelledCount.textContent = cancelledBookings.length;

    renderActiveBookingsList(activeBookings);
    renderCancelledBookingsList(cancelledBookings);
  }

  function renderActiveBookingsList(bookings) {
    elements.myBookingsContainer.innerHTML = '';

    if (bookings.length === 0) {
      elements.myBookingsContainer.innerHTML = `
        <div class="no-bookings-view">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
          <p>No active bookings found for registration <strong>${state.currentUser.regNo}</strong>.</p>
          <p style="font-size: 0.8rem; margin-top: 6px;">Head over to the <a href="#" id="linkGotoGrid" style="color: #06b6d4;">Availability Grid</a> to reserve equipment.</p>
        </div>
      `;
      const link = document.getElementById('linkGotoGrid');
      if (link) link.addEventListener('click', (e) => { e.preventDefault(); switchTab('grid'); });
      return;
    }

    bookings.forEach(b => {
      const card = document.createElement('div');
      card.className = 'my-booking-card';
      card.innerHTML = `
        <div class="card-row-top">
          <div class="card-res-title">
            <span>${b.resourceIcon || '📌'}</span> ${b.resourceName}
          </div>
          <span class="card-time-badge">${b.timeStr}</span>
        </div>

        <div class="card-details-box">
          <div class="detail-line">
            <span>Date:</span>
            <strong>${SlotSyncAPI.formatHumanDate(b.date)} (${b.date})</strong>
          </div>
          <div class="detail-line">
            <span>Registered Under:</span>
            <strong>${b.name} (${b.regNo})</strong>
          </div>
          <div class="detail-line">
            <span>Booking ID:</span>
            <code style="font-size: 0.75rem; color: #a5f3fc;">${b.id}</code>
          </div>
        </div>

        <p class="card-purpose-text">"${b.purpose}"</p>

        <button class="card-btn-cancel" data-id="${b.id}">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          Cancel Booking (Frees Slot)
        </button>
      `;

      card.querySelector('.card-btn-cancel').addEventListener('click', async () => {
        await handleCancelBooking(b.id);
      });

      elements.myBookingsContainer.appendChild(card);
    });
  }

  function renderCancelledBookingsList(cancelled) {
    elements.historyBookingsContainer.innerHTML = '';
    if (cancelled.length === 0) {
      elements.historyBookingsContainer.innerHTML = `<p style="color: #64748b; font-size: 0.8rem;">No cancelled bookings in history.</p>`;
      return;
    }

    cancelled.forEach(c => {
      const div = document.createElement('div');
      div.className = 'history-card';
      div.innerHTML = `
        <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
          <strong>${c.resourceName || c.resourceId}</strong>
          <span style="color: #f43f5e;">Cancelled</span>
        </div>
        <div>${c.date} • ${c.timeStr || c.hour + ':00'}</div>
        <div style="font-size: 0.72rem; color: #64748b; margin-top: 4px;">Purpose: "${c.purpose}"</div>
      `;
      elements.historyBookingsContainer.appendChild(div);
    });
  }

  // ==========================================
  // TAB 3: ADMIN LAB OVERVIEW (STRETCH GOAL)
  // ==========================================
  function setupAdminDate() {
    elements.adminSelectDate.value = SlotSyncAPI.toISODate(new Date());
    elements.adminSelectDate.addEventListener('change', () => {
      refreshAdminView();
    });
  }

  async function refreshAdminView() {
    const targetDate = elements.adminSelectDate.value;
    const res = await SlotSyncAPI.getAdminOverview(targetDate);
    if (!res.ok) return;

    const data = res.data;
    elements.adminTotalBooked.textContent = data.totalBookings;
    elements.adminActiveUsers.textContent = data.activeUsers;
    elements.adminUtilization.textContent = `${data.utilizationPercent}%`;
    elements.adminWaitlistCount.textContent = data.waitlistRequests;

    renderAdminMatrix(data);
  }

  function renderAdminMatrix(data) {
    const table = elements.adminMatrixTable;
    table.innerHTML = '';

    // Header Row: Time Hour + Each Resource
    const thead = document.createElement('thead');
    let headerHtml = '<tr><th style="width: 120px;">Time Window</th>';
    data.resources.forEach(r => {
      headerHtml += `<th>${r.icon} ${r.name.split('(')[0].trim()}</th>`;
    });
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;
    table.appendChild(thead);

    // Body Rows: 08:00 to 22:00
    const tbody = document.createElement('tbody');
    const now = new Date();
    const todayStr = SlotSyncAPI.toISODate(now);
    const currentHour = now.getHours();

    for (let h = 8; h < 22; h++) {
      const timeStr = `${String(h).padStart(2, '0')}:00 - ${String(h + 1).padStart(2, '0')}:00`;
      const isPast = (data.date < todayStr) || (data.date === todayStr && h <= currentHour);

      const tr = document.createElement('tr');
      let rowHtml = `<td style="font-family: var(--font-mono); font-weight: 700; color: #a5f3fc;">${timeStr}</td>`;

      data.resources.forEach(r => {
        const booking = data.bookings.find(b => b.resourceId === r.id && b.hour === h);

        if (isPast) {
          rowHtml += `<td><span class="cell-slot-state" style="background: rgba(100, 116, 139, 0.2); color: #94a3b8;">Past</span></td>`;
        } else if (booking) {
          rowHtml += `
            <td>
              <span class="cell-slot-state" style="background: rgba(244, 63, 94, 0.2); color: #fb7185; border: 1px solid rgba(244, 63, 94, 0.4);">
                Booked: ${booking.name} (${booking.regNo.slice(-4)})
              </span>
            </td>
          `;
        } else {
          rowHtml += `<td><span class="cell-slot-state" style="background: rgba(16, 185, 129, 0.15); color: #34d399;">Available</span></td>`;
        }
      });

      tr.innerHTML = rowHtml;
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
  }

  // ==========================================
  // GLOBAL TOAST NOTIFICATIONS
  // ==========================================
  function showToast(title, message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    let icon = 'ℹ️';
    if (type === 'success') icon = '✅';
    if (type === 'error') icon = '❌';
    if (type === 'warning') icon = '⚠️';

    toast.innerHTML = `
      <div class="toast-icon">${icon}</div>
      <div class="toast-body">
        <h4 class="toast-title">${title}</h4>
        <p class="toast-msg">${message}</p>
      </div>
      <button class="btn-close" style="width: 22px; height: 22px; font-size: 0.9rem;" aria-label="Close">×</button>
    `;

    toast.querySelector('.btn-close').addEventListener('click', () => toast.remove());

    elements.toastContainer.appendChild(toast);
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 5500);
  }

  window.SlotSyncApp = {
    refreshGrid,
    refreshMyBookings,
    refreshAdminView,
    switchTab,
    showToast,
    getState: () => state
  };

})();
