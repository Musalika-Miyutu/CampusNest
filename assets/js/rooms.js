// ═══════════════════════════════════════════════════════
//  ROOMS — browse, search, add, edit, delete
// ═══════════════════════════════════════════════════════

// ─── BROWSE HOSTELS (Tenant) ──────────────────────────

let hostelFilterActive = 'all';

function filterHostels(q) {
  renderHostels(q);
}

function toggleHostelFilter(el, val) {
  document.querySelectorAll('.filter-row .tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  hostelFilterActive = val;
  renderHostels(document.getElementById('hostel-search-input').value);
}

async function renderHostels(q = '') {
  const grid = document.getElementById('hostel-grid');
  grid.innerHTML = '<p style="color:var(--muted);">Loading...</p>';

  // Always refresh room cache when browsing
  const { data: rooms } = await sb.from('rooms').select('*');
  allRooms = rooms || [];

  // Apply search query
  let filtered = [...allRooms];
  if (q) filtered = filtered.filter(r =>
    r.hostel.toLowerCase().includes(q.toLowerCase())
  );

  // Apply filter tags
  if (hostelFilterActive !== 'all') {
    const map = { male: 'Male Only', female: 'Female Only', mixed: 'Mixed' };
    if (hostelFilterActive === 'ensuite') {
      filtered = filtered.filter(r => r.amenities?.includes('En-Suite'));
    } else {
      filtered = filtered.filter(r => r.preference === map[hostelFilterActive]);
    }
  }

  // Group rooms by hostel name
  const hostelMap = {};
  filtered.forEach(r => {
    if (!hostelMap[r.hostel]) {
      hostelMap[r.hostel] = { name: r.hostel, landlordId: r.landlord_id, rooms: [] };
    }
    hostelMap[r.hostel].rooms.push(r);
  });
  const hostels = Object.values(hostelMap);

  if (!hostels.length) {
    grid.innerHTML = '<p style="color:var(--muted);padding:20px;">No hostels found.</p>';
    return;
  }

  grid.innerHTML = hostels.map(h => {
    const avail    = h.rooms.filter(r => r.status === 'available').length;
    const minPrice = Math.min(...h.rooms.map(r => r.price));
    const icon     = getHostelIcon(h.name);
    const tags     = [...new Set(h.rooms.flatMap(r => r.amenities || []))].slice(0, 3);

    return `
      <div class="hostel-card" onclick="openHostelDetail('${h.name.replace(/'/g, "\\'")}')">
        <div class="hostel-img">${icon}</div>
        <div class="hostel-info">
          <div class="hostel-name">${h.name}</div>
          <div class="hostel-loc">📍 Campus Area</div>
          <div class="hostel-meta">
            ${tags.map(t => `<span class="badge badge-blue">${t}</span>`).join('')}
          </div>
        </div>
        <div class="hostel-footer">
          <div class="room-price">
            ZMW ${minPrice.toLocaleString()}
            <span style="font-size:11px;color:var(--muted);font-weight:400;">/mo</span>
          </div>
          <div class="room-avail">${avail === 0 ? 'Fully Booked' : avail + ' available'}</div>
        </div>
      </div>`;
  }).join('');
}

// ─── HOSTEL DETAIL PAGE ───────────────────────────────

async function openHostelDetail(hostelName) {
  document.querySelectorAll('[id^="view-"]').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-hostel-detail').classList.remove('hidden');
  document.getElementById('hostel-detail-content').innerHTML =
    '<p style="color:var(--muted);">Loading...</p>';

  const rooms    = allRooms.filter(r => r.hostel === hostelName);
  const avail    = rooms.filter(r => r.status === 'available');
  const landlord = await getProfile(rooms[0]?.landlord_id);

  document.getElementById('hostel-detail-content').innerHTML = `
    <div class="card" style="margin-bottom:20px;">
      <div style="display:flex;align-items:center;gap:16px;margin-bottom:20px;">
        <div style="font-size:48px;">${getHostelIcon(hostelName)}</div>
        <div>
          <h2 style="font-family:'Playfair Display',serif;font-size:26px;">${hostelName}</h2>
          <p style="color:var(--muted);font-size:13px;">
            📍 Campus Area · Managed by ${landlord?.name || 'Unknown'}
          </p>
          <div style="margin-top:8px;">
            <span class="badge badge-green">${avail.length} rooms available</span>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title">Available Rooms</div>
      <div class="room-list">
        <div class="room-row header">
          <div>Room #</div>
          <div>Floor</div>
          <div>Price/mo</div>
          <div>Preference</div>
          <div>Amenities</div>
          <div>Action</div>
        </div>
        ${rooms.map(r => `
          <div class="room-row">
            <div class="room-num">${r.room_number}</div>
            <div style="font-size:13px;">${r.floor}</div>
            <div style="font-weight:600;color:var(--accent);">ZMW ${r.price.toLocaleString()}</div>
            <div>
              <span class="badge ${
                r.preference === 'Male Only'   ? 'badge-blue'  :
                r.preference === 'Female Only' ? 'badge-yellow': 'badge-green'
              }">${r.preference}</span>
            </div>
            <div style="font-size:12px;color:var(--muted);">
              ${(r.amenities || []).join(', ') || '—'}
            </div>
            <div>
              ${r.status === 'available'
                ? `<button
                     class="btn btn-primary"
                     style="padding:7px 14px;font-size:12px;"
                     onclick="enquireRoom(
                       '${r.id}',
                       '${r.landlord_id}',
                       '${r.hostel.replace(/'/g, "\\'")}',
                       '${r.room_number}'
                     )">Enquire</button>`
                : `<span class="badge badge-red">Booked</span>`}
            </div>
          </div>`).join('')}
      </div>
    </div>`;
}

function closeHostelDetail() {
  navTo('t-browse');
}

// ─── ENQUIRE ABOUT A ROOM ─────────────────────────────

async function enquireRoom(roomId, landlordId, hostelName, roomNum) {
  const msgText = `Hi, I'm interested in Room ${roomNum} at ${hostelName}. Is it still available?`;

  const { error } = await sb.from('messages').insert({
    from_user: currentUser.id,
    to_user:   landlordId,
    room_id:   roomId,
    text:      msgText
  });

  if (error) {
    toast('Failed to send enquiry. Try again.', 'error');
    return;
  }

  toast('Enquiry sent! Check your messages.', 'success');
  updateMsgBadges();
  navTo('t-messages');
}

// ─── SEARCH ROOMS (Tenant) ────────────────────────────

async function populateHostelSelect() {
  const { data: rooms } = await sb.from('rooms').select('hostel');
  const names = [...new Set((rooms || []).map(r => r.hostel))];
  const sel   = document.getElementById('filter-hostel');
  sel.innerHTML = '<option value="">Any Hostel</option>' +
    names.map(n => `<option>${n}</option>`).join('');
}

async function runRoomSearch() {
  const hostel = document.getElementById('filter-hostel').value;
  const floor  = document.getElementById('filter-floor').value;
  const price  = parseInt(document.getElementById('filter-price').value) || 999999;
  const pref   = document.getElementById('filter-pref').value;

  let query = sb.from('rooms').select('*').eq('status', 'available').lte('price', price);
  if (hostel) query = query.eq('hostel', hostel);
  if (floor)  query = query.eq('floor', floor);
  if (pref)   query = query.eq('preference', pref);

  const { data: results } = await query;
  const container = document.getElementById('search-results');

  const rows = (results || []).map(r => `
    <div class="room-row">
      <div class="room-num">${r.room_number}</div>
      <div style="font-size:13px;">${r.hostel}</div>
      <div style="font-size:13px;">${r.floor}</div>
      <div style="font-weight:600;color:var(--accent);">ZMW ${r.price.toLocaleString()}</div>
      <div>
        <span class="badge ${
          r.preference === 'Male Only'   ? 'badge-blue'  :
          r.preference === 'Female Only' ? 'badge-yellow': 'badge-green'
        }">${r.preference}</span>
      </div>
      <div>
        <button
          class="btn btn-primary"
          style="padding:7px 14px;font-size:12px;"
          onclick="enquireRoom(
            '${r.id}',
            '${r.landlord_id}',
            '${r.hostel.replace(/'/g, "\\'")}',
            '${r.room_number}'
          )">Enquire</button>
      </div>
    </div>`).join('');

  container.innerHTML = `
    <div class="room-row header">
      <div>Room #</div><div>Hostel</div><div>Floor</div>
      <div>Price/mo</div><div>Pref.</div><div>Action</div>
    </div>
    ${rows || '<p style="padding:20px;color:var(--muted);">No rooms match your search.</p>'}`;
}

function clearSearch() {
  ['filter-hostel', 'filter-floor', 'filter-price', 'filter-pref'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('search-results').innerHTML = `
    <div class="room-row header">
      <div>Room #</div><div>Hostel</div><div>Floor</div>
      <div>Price/mo</div><div>Pref.</div><div>Action</div>
    </div>`;
}

// ─── LANDLORD: MY ROOMS ───────────────────────────────

async function renderLRooms() {
  document.getElementById('l-room-rows').innerHTML =
    '<p style="color:var(--muted);padding:20px;">Loading...</p>';

  const { data: rooms } = await sb
    .from('rooms')
    .select('*')
    .eq('landlord_id', currentUser.id)
    .order('created_at', { ascending: false });

  document.getElementById('l-room-rows').innerHTML = (rooms || []).map(r => `
    <div class="room-row">
      <div class="room-num">${r.room_number}</div>
      <div style="font-size:13px;">${r.hostel}</div>
      <div style="font-size:13px;">${r.floor}</div>
      <div style="font-weight:600;color:var(--accent);">ZMW ${r.price.toLocaleString()}</div>
      <div>
        <span class="badge ${r.status === 'available' ? 'badge-green' : 'badge-red'}">
          ${r.status.toUpperCase()}
        </span>
      </div>
      <div style="display:flex;gap:6px;">
        <button
          class="btn btn-outline"
          style="padding:5px 12px;font-size:12px;"
          onclick="toggleRoomStatus('${r.id}','${r.status}')">
          ${r.status === 'available' ? 'Mark Booked' : 'Mark Available'}
        </button>
        <button
          class="btn btn-danger"
          style="padding:5px 12px;font-size:12px;"
          onclick="deleteRoom('${r.id}')">
          Remove
        </button>
      </div>
    </div>`).join('') ||
    '<p style="padding:20px;color:var(--muted);">No rooms yet. Click "Add Room" to get started.</p>';
}

async function toggleRoomStatus(roomId, currentStatus) {
  const newStatus = currentStatus === 'available' ? 'booked' : 'available';
  await sb.from('rooms').update({ status: newStatus }).eq('id', roomId);
  // Update local cache
  const r = allRooms.find(r => r.id === roomId);
  if (r) r.status = newStatus;
  renderLRooms();
  toast('Room status updated.', 'success');
}

async function deleteRoom(roomId) {
  if (!confirm('Are you sure you want to remove this room?')) return;
  await sb.from('rooms').delete().eq('id', roomId);
  allRooms = allRooms.filter(r => r.id !== roomId);
  renderLRooms();
  toast('Room removed.', 'success');
}

// ─── LANDLORD: ADD ROOM ───────────────────────────────

function resetAddForm() {
  ['add-hostel-name', 'add-room-num', 'add-price', 'add-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('add-floor').value = 'Ground Floor';
  document.querySelectorAll('#pref-tags .tag').forEach((t, i) => {
    t.classList.toggle('active', i === 0);
  });
  document.querySelectorAll('#amenity-tags .tag').forEach(t => {
    t.classList.remove('active');
  });
}

function selectPref(el) {
  document.querySelectorAll('#pref-tags .tag').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
}

function toggleTag(el) {
  el.classList.toggle('active');
}

async function addRoom() {
  const hostel      = document.getElementById('add-hostel-name').value.trim();
  const room_number = document.getElementById('add-room-num').value.trim();
  const price       = parseInt(document.getElementById('add-price').value);
  const floor       = document.getElementById('add-floor').value;
  const preference  = document.querySelector('#pref-tags .tag.active')?.dataset.val || 'Mixed';
  const amenities   = [...document.querySelectorAll('#amenity-tags .tag.active')].map(t => t.dataset.val);
  const notes       = document.getElementById('add-notes').value.trim();

  if (!hostel || !room_number || !price) {
    toast('Please fill in Hostel, Room Number, and Price.', 'error');
    return;
  }

  const { data, error } = await sb.from('rooms').insert({
    landlord_id: currentUser.id,
    hostel,
    room_number,
    floor,
    price,
    preference,
    amenities,
    notes,
    status: 'available'
  }).select().single();

  if (error) {
    toast('Failed to add room: ' + error.message, 'error');
    return;
  }

  // Add to local cache
  allRooms.push(data);
  toast('Room listed successfully!', 'success');
  navTo('l-rooms');
}

// ─── LANDLORD: DASHBOARD ──────────────────────────────

async function renderLDashboard() {
  document.getElementById('l-stats').innerHTML =
    '<p style="color:var(--muted);">Loading...</p>';

  const { data: myRooms } = await sb
    .from('rooms')
    .select('*')
    .eq('landlord_id', currentUser.id);

  // Update local room cache with landlord's own rooms
  allRooms = [
    ...allRooms.filter(r => r.landlord_id !== currentUser.id),
    ...(myRooms || [])
  ];

  const avail  = (myRooms || []).filter(r => r.status === 'available').length;
  const booked = (myRooms || []).filter(r => r.status === 'booked').length;

  const { count: pendingDeals } = await sb
    .from('deals')
    .select('*', { count: 'exact', head: true })
    .eq('landlord_id', currentUser.id)
    .eq('status', 'pending');

  const { count: msgCount } = await sb
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('to_user', currentUser.id);

  document.getElementById('l-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Rooms</div>
      <div class="stat-value">${(myRooms || []).length}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Available</div>
      <div class="stat-value" style="color:var(--green);">${avail}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Booked</div>
      <div class="stat-value" style="color:var(--accent2);">${booked}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pending Deals</div>
      <div class="stat-value" style="color:var(--accent);">${pendingDeals || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Messages</div>
      <div class="stat-value">${msgCount || 0}</div>
    </div>`;

  // Recent enquiries
  const { data: msgs } = await sb
    .from('messages')
    .select('*')
    .eq('to_user', currentUser.id)
    .order('created_at', { ascending: false })
    .limit(3);

  const enquiryItems = await Promise.all((msgs || []).map(async m => {
    const sender = await getProfile(m.from_user);
    return `
      <div class="notif-item unread" onclick="navTo('l-messages')" style="cursor:pointer;">
        <div class="chat-avatar" style="
          width:36px;height:36px;
          background:${avatarColor(sender?.id)};color:#111;
          border-radius:50%;display:flex;align-items:center;
          justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">
          ${initials(sender?.name)}
        </div>
        <div class="notif-body">
          <div class="notif-title">${sender?.name || '?'}</div>
          <div class="notif-sub">${m.text}</div>
        </div>
        <div class="notif-time">${fmtTime(m.created_at)}</div>
      </div>`;
  }));

  document.getElementById('l-recent-enquiries').innerHTML =
    enquiryItems.join('') ||
    '<p style="color:var(--muted);font-size:13px;">No enquiries yet.</p>';

  // Room status list
  document.getElementById('l-room-status-list').innerHTML = `
    <div class="room-row header">
      <div>Room #</div><div>Hostel</div><div>Floor</div><div>Status</div>
    </div>
    ${(myRooms || []).map(r => `
      <div class="room-row">
        <div class="room-num">${r.room_number}</div>
        <div style="font-size:13px;">${r.hostel}</div>
        <div style="font-size:12px;color:var(--muted);">${r.floor}</div>
        <div>
          <span class="badge ${r.status === 'available' ? 'badge-green' : 'badge-red'}">
            ${r.status.toUpperCase()}
          </span>
        </div>
      </div>`).join('')}`;
}