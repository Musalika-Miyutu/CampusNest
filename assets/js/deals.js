// ═══════════════════════════════════════════════════════
//  DEALS — propose, confirm, decline room booking deals
// ═══════════════════════════════════════════════════════

// ─── PROPOSE A DEAL (Tenant) ──────────────────────────
// Called when tenant clicks "Propose Deal" in the chat

async function sendDeal(landlordId, roomId, hostelName, roomNum) {
  if (!roomId) {
    toast('Cannot propose deal — no room linked to this conversation.', 'error');
    return;
  }

  // Check if a deal already exists for this room
  const { data: existing } = await sb
    .from('deals')
    .select('id')
    .eq('tenant_id', currentUser.id)
    .eq('room_id', roomId)
    .maybeSingle();

  if (existing) {
    toast('You have already proposed a deal for this room.', 'error');
    return;
  }

  // Create the deal record
  const { error: dealError } = await sb.from('deals').insert({
    tenant_id:   currentUser.id,
    landlord_id: landlordId,
    room_id:     roomId,
    status:      'pending'
  });

  if (dealError) {
    toast('Failed to propose deal. Try again.', 'error');
    return;
  }

  // Send an automatic message to notify the landlord
  await sb.from('messages').insert({
    from_user: currentUser.id,
    to_user:   landlordId,
    room_id:   roomId,
    text:      `📋 I'd like to formally book Room ${roomNum} at ${hostelName}. Can we finalize?`
  });

  toast('Deal proposed! Awaiting landlord confirmation.', 'success');
  navTo('t-messages');
}

// ─── CONFIRM A DEAL (Landlord) ────────────────────────
// Called when landlord clicks "Confirm Deal" in the chat

async function confirmDeal(tenantId) {
  // Find the pending deal between this landlord and tenant
  const { data: deal } = await sb
    .from('deals')
    .select('*')
    .eq('tenant_id',   tenantId)
    .eq('landlord_id', currentUser.id)
    .eq('status',      'pending')
    .maybeSingle();

  if (!deal) {
    toast('No pending deal found with this tenant.', 'error');
    return;
  }

  // Mark the deal as confirmed
  const { error: dealError } = await sb
    .from('deals')
    .update({ status: 'confirmed' })
    .eq('id', deal.id);

  if (dealError) {
    toast('Failed to confirm deal. Try again.', 'error');
    return;
  }

  // Mark the room as booked
  await sb
    .from('rooms')
    .update({ status: 'booked' })
    .eq('id', deal.room_id);

  // Update local room cache
  const room = allRooms.find(r => r.id === deal.room_id);
  if (room) room.status = 'booked';

  // Send a confirmation message to the tenant
  await sb.from('messages').insert({
    from_user: currentUser.id,
    to_user:   tenantId,
    room_id:   deal.room_id,
    text:      `✅ Deal confirmed! Room ${room?.room_number} at ${room?.hostel} is yours. Welcome aboard!`
  });

  toast('Deal confirmed! Room marked as booked.', 'success');
  navTo('l-messages');
}

// ─── DECLINE A DEAL (Landlord) ────────────────────────

async function declineDeal(dealId) {
  const { error } = await sb
    .from('deals')
    .update({ status: 'declined' })
    .eq('id', dealId);

  if (error) {
    toast('Failed to decline deal. Try again.', 'error');
    return;
  }

  toast('Deal declined.', 'error');
  renderDeals();
}

// ─── RENDER DEALS PAGE ────────────────────────────────
// Shows all deals for the current user (landlord or tenant)

async function renderDeals() {
  const list = document.getElementById('deals-list');
  list.innerHTML = '<p style="color:var(--muted);">Loading...</p>';

  // Fetch deals based on role
  const col = currentUser.role === 'landlord' ? 'landlord_id' : 'tenant_id';
  const { data: deals } = await sb
    .from('deals')
    .select('*')
    .eq(col, currentUser.id)
    .order('created_at', { ascending: false });

  if (!deals?.length) {
    list.innerHTML = '<p style="color:var(--muted);padding:20px;">No deals yet.</p>';
    return;
  }

  // Build each deal row
  const rows = await Promise.all(deals.map(async d => {
    const room     = allRooms.find(r => r.id === d.room_id);
    const tenant   = await getProfile(d.tenant_id);
    const landlord = await getProfile(d.landlord_id);

    const badges = {
      confirmed: 'badge-green',
      declined:  'badge-red',
      pending:   'badge-yellow'
    };

    return `
      <div class="notif-item ${d.status === 'pending' ? 'unread' : ''}">
        <div class="notif-icon">🤝</div>
        <div class="notif-body">
          <div class="notif-title">
            Room ${room?.room_number || '?'} — ${room?.hostel || '?'}
          </div>
          <div class="notif-sub">
            ${currentUser.role === 'landlord'
              ? 'Tenant: '   + (tenant?.name   || '?')
              : 'Landlord: ' + (landlord?.name || '?')}
            · ZMW ${room?.price?.toLocaleString() || '?'}/mo
          </div>
          <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
            <span class="badge ${badges[d.status]}">
              ${d.status.toUpperCase()}
            </span>
            <span style="font-size:12px;color:var(--muted);">
              ${new Date(d.created_at).toLocaleDateString()}
            </span>
            ${d.status === 'pending' && currentUser.role === 'landlord'
              ? `<button
                   class="btn btn-green"
                   style="padding:5px 12px;font-size:12px;"
                   onclick="confirmDeal('${d.tenant_id}')">
                   Confirm
                 </button>
                 <button
                   class="btn btn-danger"
                   style="padding:5px 12px;font-size:12px;"
                   onclick="declineDeal('${d.id}')">
                   Decline
                 </button>`
              : ''}
          </div>
        </div>
      </div>`;
  }));

  list.innerHTML = rows.join('');
}

// ─── RENDER BOOKINGS PAGE (Tenant) ───────────────────
// Shows all deals the tenant has made

async function renderBookings() {
  const list = document.getElementById('bookings-list');
  list.innerHTML = '<p style="color:var(--muted);">Loading...</p>';

  const { data: deals } = await sb
    .from('deals')
    .select('*')
    .eq('tenant_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (!deals?.length) {
    list.innerHTML = `
      <p style="color:var(--muted);padding:20px;">
        No bookings yet. Enquire about a room to get started.
      </p>`;
    return;
  }

  const rows = await Promise.all(deals.map(async d => {
    const room     = allRooms.find(r => r.id === d.room_id);
    const landlord = await getProfile(d.landlord_id);

    const badges = {
      confirmed: 'badge-green',
      declined:  'badge-red',
      pending:   'badge-yellow'
    };

    return `
      <div class="notif-item ${d.status === 'pending' ? 'unread' : ''}">
        <div class="notif-icon">${d.status === 'confirmed' ? '✅' : '📋'}</div>
        <div class="notif-body">
          <div class="notif-title">
            Room ${room?.room_number || '?'} — ${room?.hostel || '?'}
          </div>
          <div class="notif-sub">
            Floor: ${room?.floor || '?'} ·
            ZMW ${room?.price?.toLocaleString() || '?'}/mo ·
            Landlord: ${landlord?.name || '?'}
          </div>
          <div style="margin-top:8px;">
            <span class="badge ${badges[d.status]}">
              ${d.status.toUpperCase()}
            </span>
          </div>
        </div>
        <div class="notif-time">
          ${new Date(d.created_at).toLocaleDateString()}
        </div>
      </div>`;
  }));

  list.innerHTML = rows.join('');
}