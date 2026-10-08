/**
 * SlotSync (PS-08) — Acceptance Test Runner
 * Direct verification of all four "We'll Test" scenarios and edge cases from rules.md.
 */

(function () {
  'use strict';

  const TEST_DEFINITIONS = [
    {
      id: 'test-1',
      tag: 'Acceptance 1',
      title: 'Book Two Printer Slots on Same Day',
      desc: 'Verify that booking two 1-hour slots on printer-1 for the same user on the same date succeeds with HTTP 201.',
      run: async (ctx) => {
        const date = ctx.targetDate;
        // Slot 1
        const res1 = await SlotSyncAPI.createBooking({
          resourceId: 'printer-1',
          date: date,
          hour: ctx.hourA,
          name: 'Test Student A',
          regNo: ctx.testReg,
          purpose: 'Acceptance Test 1 — First Slot'
        });
        ctx.log(`[TEST 1] POST /api/bookings (Hour ${ctx.hourA}) -> HTTP ${res1.status}`);
        if (res1.status !== 201) throw new Error(`Expected HTTP 201 for first slot, got ${res1.status}: ${JSON.stringify(res1.data)}`);

        // Slot 2
        const res2 = await SlotSyncAPI.createBooking({
          resourceId: 'printer-1',
          date: date,
          hour: ctx.hourB,
          name: 'Test Student A',
          regNo: ctx.testReg,
          purpose: 'Acceptance Test 1 — Second Slot'
        });
        ctx.log(`[TEST 1] POST /api/bookings (Hour ${ctx.hourB}) -> HTTP ${res2.status}`);
        if (res2.status !== 201) throw new Error(`Expected HTTP 201 for second slot, got ${res2.status}: ${JSON.stringify(res2.data)}`);

        ctx.createdBooking1 = res1.data;
        ctx.createdBooking2 = res2.data;
        return 'Both slots booked successfully with HTTP 201';
      }
    },
    {
      id: 'test-2',
      tag: 'Acceptance 2 (KEY CHALLENGE)',
      title: 'Try Third Printer Slot (Fair-Use Rejection)',
      desc: 'Verify that attempting a 3rd slot on printer-1 on the same day for the same user is rejected with HTTP 422 LIMIT_EXCEEDED and clear message.',
      run: async (ctx) => {
        const date = ctx.targetDate;
        const res = await SlotSyncAPI.createBooking({
          resourceId: 'printer-1',
          date: date,
          hour: ctx.hourC,
          name: 'Test Student A',
          regNo: ctx.testReg,
          purpose: 'Acceptance Test 2 — Greedy Third Slot'
        });

        ctx.log(`[TEST 2] POST /api/bookings (Hour ${ctx.hourC}) -> HTTP ${res.status} [${res.data.error || ''}]: "${res.data.message || ''}"`);

        if (res.status !== 422) {
          throw new Error(`Expected HTTP 422 LIMIT_EXCEEDED, but received HTTP ${res.status}`);
        }

        if (res.data.error !== 'LIMIT_EXCEEDED') {
          throw new Error(`Expected error code 'LIMIT_EXCEEDED', got '${res.data.error}'`);
        }

        if (!res.data.message || !res.data.message.includes('already have 2 hours booked')) {
          throw new Error(`Error message missing required phrasing. Got: "${res.data.message}"`);
        }

        return `Correctly rejected with HTTP 422 LIMIT_EXCEEDED and clear message: "${res.data.message}"`;
      }
    },
    {
      id: 'test-3',
      tag: 'Acceptance 3',
      title: 'Double Booking Conflict (Unique Slot)',
      desc: 'Verify that another user attempting to book an already occupied slot is rejected with HTTP 409 SLOT_TAKEN.',
      run: async (ctx) => {
        const date = ctx.targetDate;
        // Try booking hourA which is already booked by Test Student A
        const res = await SlotSyncAPI.createBooking({
          resourceId: 'printer-1',
          date: date,
          hour: ctx.hourA,
          name: 'Competitor Student B',
          regNo: 'RA2511003010888',
          purpose: 'Acceptance Test 3 — Clash Attempt'
        });

        ctx.log(`[TEST 3] POST /api/bookings (Hour ${ctx.hourA} Clash) -> HTTP ${res.status} [${res.data.error || ''}]`);

        if (res.status !== 409) {
          throw new Error(`Expected HTTP 409 SLOT_TAKEN, but received HTTP ${res.status}`);
        }

        if (res.data.error !== 'SLOT_TAKEN') {
          throw new Error(`Expected error code 'SLOT_TAKEN', got '${res.data.error}'`);
        }

        return `Double booking blocked with HTTP 409: "${res.data.message}"`;
      }
    },
    {
      id: 'test-4',
      tag: 'Acceptance 4',
      title: 'Cancel Booking & Quota Restoration',
      desc: 'Verify that cancelling a booking succeeds with HTTP 200, frees the slot, and allows booking again.',
      run: async (ctx) => {
        if (!ctx.createdBooking1) throw new Error('No booking from Test 1 to cancel');

        // Cancel first booking
        const resCancel = await SlotSyncAPI.cancelBooking(ctx.createdBooking1.id);
        ctx.log(`[TEST 4] DELETE /api/bookings/${ctx.createdBooking1.id} -> HTTP ${resCancel.status}`);

        if (resCancel.status !== 200) {
          throw new Error(`Expected HTTP 200 on cancel, got ${resCancel.status}`);
        }

        // Now test user should be able to book hourC (which was previously rejected in Test 2)
        const date = ctx.targetDate;
        const resRebook = await SlotSyncAPI.createBooking({
          resourceId: 'printer-1',
          date: date,
          hour: ctx.hourC,
          name: 'Test Student A',
          regNo: ctx.testReg,
          purpose: 'Acceptance Test 4 — Rebooking After Cancel'
        });

        ctx.log(`[TEST 4] POST /api/bookings (Rebook Hour ${ctx.hourC}) -> HTTP ${resRebook.status}`);

        if (resRebook.status !== 201) {
          throw new Error(`Expected HTTP 201 after freeing quota, but got HTTP ${resRebook.status}: ${JSON.stringify(resRebook.data)}`);
        }

        return 'Cancelled booking freed slot; new slot booked successfully with HTTP 201';
      }
    },
    {
      id: 'test-5',
      tag: 'Edge Case: Past Slot',
      title: 'Reject Booking for Past Hour (Rule R4)',
      desc: 'Verify that booking a slot that has already passed today or yesterday returns HTTP 400 PAST_SLOT.',
      run: async (ctx) => {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = SlotSyncAPI.toISODate(yesterday);

        const res = await SlotSyncAPI.createBooking({
          resourceId: 'printer-1',
          date: yesterdayStr,
          hour: 10,
          name: 'Test Student A',
          regNo: ctx.testReg,
          purpose: 'Edge Case Past Slot'
        });

        ctx.log(`[EDGE CASE] Past slot booking -> HTTP ${res.status} [${res.data.error || ''}]`);

        if (res.status !== 400 || res.data.error !== 'PAST_SLOT') {
          throw new Error(`Expected HTTP 400 PAST_SLOT, got ${res.status}: ${JSON.stringify(res.data)}`);
        }

        return `Past slot rejected with HTTP 400 PAST_SLOT: "${res.data.message}"`;
      }
    },
    {
      id: 'test-6',
      tag: 'Edge Case: 7-Day Window',
      title: 'Reject Booking Beyond 7 Days (Rule R2)',
      desc: 'Verify that booking 10 days in the future returns HTTP 400 OUT_OF_RANGE.',
      run: async (ctx) => {
        const farFuture = new Date();
        farFuture.setDate(farFuture.getDate() + 10);
        const farFutureStr = SlotSyncAPI.toISODate(farFuture);

        const res = await SlotSyncAPI.createBooking({
          resourceId: 'printer-1',
          date: farFutureStr,
          hour: 14,
          name: 'Test Student A',
          regNo: ctx.testReg,
          purpose: 'Edge Case Out of Range'
        });

        ctx.log(`[EDGE CASE] Out of range date -> HTTP ${res.status} [${res.data.error || ''}]`);

        if (res.status !== 400 || res.data.error !== 'OUT_OF_RANGE') {
          throw new Error(`Expected HTTP 400 OUT_OF_RANGE, got ${res.status}: ${JSON.stringify(res.data)}`);
        }

        return `Future slot beyond 7 days rejected with HTTP 400 OUT_OF_RANGE`;
      }
    },
    {
      id: 'test-7',
      tag: 'Edge Case: Cross-Resource',
      title: 'Independent Limit per Resource',
      desc: 'Verify that 2 hours on 3D Printer does NOT block booking on Soldering Station 1 (limit is per resource).',
      run: async (ctx) => {
        const date = ctx.targetDate;
        const res = await SlotSyncAPI.createBooking({
          resourceId: 'soldering-1',
          date: date,
          hour: ctx.hourD,
          name: 'Test Student A',
          regNo: ctx.testReg,
          purpose: 'Edge Case Cross-Resource Limit'
        });

        ctx.log(`[EDGE CASE] Booking soldering-1 while printer has bookings -> HTTP ${res.status}`);

        if (res.status !== 201) {
          throw new Error(`Expected HTTP 201 on different resource, got ${res.status}: ${JSON.stringify(res.data)}`);
        }

        return 'Soldering station booked successfully (2-hour limit is strictly per-resource)';
      }
    },
    {
      id: 'test-8',
      tag: 'Edge Case: Non-existent Booking',
      title: 'Cancel Non-existent Booking Returns 404',
      desc: 'Verify that calling DELETE /api/bookings/:id with a bogus ID returns HTTP 404 NOT_FOUND.',
      run: async (ctx) => {
        const res = await SlotSyncAPI.cancelBooking('bk_does_not_exist_99999');
        ctx.log(`[EDGE CASE] DELETE non-existent booking -> HTTP ${res.status} [${res.data.error || ''}]`);

        if (res.status !== 404) {
          throw new Error(`Expected HTTP 404 NOT_FOUND, got ${res.status}`);
        }

        return 'Non-existent booking correctly returned HTTP 404 NOT_FOUND';
      }
    }
  ];

  document.addEventListener('DOMContentLoaded', () => {
    initTestCards();
    setupTestButtons();
  });

  function initTestCards() {
    const container = document.getElementById('testCasesList');
    if (!container) return;
    container.innerHTML = '';

    TEST_DEFINITIONS.forEach(def => {
      const card = document.createElement('div');
      card.className = 'test-case-item';
      card.id = `card-${def.id}`;
      card.innerHTML = `
        <div class="test-case-left">
          <div class="test-icon-indicator" id="indicator-${def.id}">⏳</div>
          <div>
            <h4 class="test-name">${def.title}</h4>
            <p class="test-desc" id="desc-${def.id}">${def.desc}</p>
          </div>
        </div>
        <div>
          <span class="test-tag">${def.tag}</span>
        </div>
      `;
      container.appendChild(card);
    });
  }

  function setupTestButtons() {
    const btnRun = document.getElementById('btnRunAcceptanceTests');
    const btnReset = document.getElementById('btnResetDemoData');
    const btnClearTerminal = document.getElementById('btnClearTerminal');
    const terminal = document.getElementById('terminalLog');

    if (btnRun) {
      btnRun.addEventListener('click', async () => {
        await runAllTests();
      });
    }

    if (btnReset) {
      btnReset.addEventListener('click', async () => {
        await SlotSyncAPI.resetData();
        terminal.textContent = 'Seed database restored to initial state.\n';
        if (window.SlotSyncApp) {
          await window.SlotSyncApp.refreshGrid();
          await window.SlotSyncApp.refreshMyBookings();
        }
        window.SlotSyncApp.showToast('Database Reset', 'Clean seed data restored.', 'info');
      });
    }

    if (btnClearTerminal) {
      btnClearTerminal.addEventListener('click', () => {
        terminal.textContent = '';
      });
    }
  }

  async function runAllTests() {
    const terminal = document.getElementById('terminalLog');
    const scoreBadge = document.getElementById('testScoreBadge');
    const summaryText = document.getElementById('testSummaryText');
    const progressFill = document.getElementById('testProgressFill');
    const btnRun = document.getElementById('btnRunAcceptanceTests');

    btnRun.disabled = true;
    terminal.textContent = '========================================\n';
    terminal.textContent += 'STARTING SLTSYNC ACCEPTANCE TEST SUITE\n';
    terminal.textContent += `Timestamp: ${new Date().toISOString()}\n`;
    terminal.textContent += '========================================\n\n';

    let passedCount = 0;
    const total = TEST_DEFINITIONS.length;

    // Pick target tomorrow or future date so hours 10, 11, 12, 13 are definitely in the future
    const targetDateObj = new Date();
    targetDateObj.setDate(targetDateObj.getDate() + 2); // 2 days ahead, guaranteed future
    const targetDate = SlotSyncAPI.toISODate(targetDateObj);

    const testContext = {
      targetDate: targetDate,
      hourA: 10,
      hourB: 11,
      hourC: 12,
      hourD: 14,
      testReg: 'TEST_STUDENT_' + Math.floor(Math.random() * 8999 + 1000),
      createdBooking1: null,
      createdBooking2: null,
      log: (msg) => {
        terminal.textContent += `${msg}\n`;
        terminal.scrollTop = terminal.scrollHeight;
      }
    };

    for (let i = 0; i < TEST_DEFINITIONS.length; i++) {
      const def = TEST_DEFINITIONS[i];
      const card = document.getElementById(`card-${def.id}`);
      const indicator = document.getElementById(`indicator-${def.id}`);
      const descEl = document.getElementById(`desc-${def.id}`);

      card.className = 'test-case-item status-running';
      indicator.textContent = '⚙️';
      summaryText.textContent = `Running: ${def.title}...`;

      try {
        await new Promise(r => setTimeout(r, 200)); // smooth visual delay
        const resultMsg = await def.run(testContext);

        card.className = 'test-case-item status-pass';
        indicator.textContent = '✓';
        descEl.innerHTML = `<span style="color: #34d399; font-weight: 600;">PASS:</span> ${resultMsg}`;
        passedCount++;
        testContext.log(`>>> [PASS] ${def.title}\n`);
      } catch (err) {
        card.className = 'test-case-item status-fail';
        indicator.textContent = '✕';
        descEl.innerHTML = `<span style="color: #fb7185; font-weight: 600;">FAIL:</span> ${err.message}`;
        testContext.log(`>>> [FAIL] ${def.title}: ${err.message}\n`);
      }

      const percent = Math.round(((i + 1) / total) * 100);
      progressFill.style.width = `${percent}%`;
      scoreBadge.textContent = `${passedCount} / ${total} Passed`;
    }

    if (passedCount === total) {
      scoreBadge.classList.add('all-passed');
      summaryText.textContent = `All ${total} tests passed! 100% compliant with rules.md.`;
      if (window.SlotSyncApp) {
        window.SlotSyncApp.showToast('All Acceptance Tests Passed! 🎉', `${total}/${total} tests passed. Full rule compliance verified!`, 'success');
        await window.SlotSyncApp.refreshGrid();
        await window.SlotSyncApp.refreshMyBookings();
      }
    } else {
      summaryText.textContent = `${passedCount} of ${total} tests passed.`;
    }

    testContext.log('========================================');
    testContext.log(`TEST SUITE COMPLETED: ${passedCount}/${total} PASSED`);
    testContext.log('========================================\n');

    btnRun.disabled = false;
  }

})();
