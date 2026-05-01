// ═══════════════════════════════════════════════════════
//  ADMIN — manage all users, rooms, and platform data
// ═══════════════════════════════════════════════════════

// ─── CHECK IF CURRENT USER IS ADMIN ──────────────────

async function checkIsAdmin() {
  const { data } = await sb
    .from('profiles')
    .select('is_admin')
    .eq('id', currentUser.id)
    .single();
  return data?.is_admin === true;
}

// ─── RENDER ADMIN DASHBOARD ───────────────────────────

async function renderAdminDashboard() {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    document.getElementById('view-admin').innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🚫</div>
        <div class="empty-title">Access Denied</div>
        <div class="empty-sub">You do not have admin privileges.</div>
      </div>`;
    return;
  }

  // Load all stats
  const [
    { count: totalUsers },
    { count: totalRooms },
    { count: totalMessages },
    { count: totalDeals },
    { count: pendingDeals },
    { count: totalReviews }
  ] = await Promise.all([
    sb.from('profiles').select('*', { count: 'exact', head: true }),
    sb.from('rooms').select('*', { count: 'exact', head: true }),
    sb.from('messages').select('*', { count: 'exact', head: true }),
    sb.from('deals').select('*', { count: 'exact', head: true }),
    sb.from('deals').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('reviews').select('*', { count: 'exact', head: true }),
  ]);

  document.getElementById('admin-stats').innerHTML = `
    <div class="stat-card">
      <div class="stat-label">Total Users</div>
      <div class="stat-value">${totalUsers || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Rooms</div>
      <div class="stat-value">${totalRooms || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Messages Sent</div>
      <div class="stat-value">${totalMessages || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Deals</div>
      <div class="stat-value">${totalDeals || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Pending Deals</div>
      <div class="stat-value" style="color:var(--accent);">${pendingDeals || 0}</div>
    </div>
    <div class="stat-card">
      <div class="stat-label">Total Reviews</div>
      <div class="stat-value">${totalReviews || 0}</div>
    </div>`;

  // Load tabs
  loadAdminUsers();
}

// ─── ADMIN: USERS TAB ────────────────────────────────

async function loadAdminUsers() {
  showAdminTab('users');
  const container = document.getElementById('admin-tab-content');
  container.innerHTML = '<p style="color:var(--muted);">Loading users...</p>';

  const { data: users } = await sb
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false });

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
      <div style="font-weight:600;font-size:16px;">All Users (${users?.length || 0})</div>
      <div class="search-bar" style="width:260px;">
        <span>🔍</span>
        <input placeholder="Search users..."
               oninput="filterAdminUsers(this.value)"
               id="admin-user-search" />
      </div>
    </div>
    <div id="admin-users-list">
      ${renderUserRows(users || [])}
    </div>`;
}

function renderUserRows(users) {
  if (!users.length) return '<p style="color:var(--muted);padding:20px;">No users found.</p>';
  return `
    <div class="room-row header" style="grid-template-columns:1fr 100px 120px 100px 140px;">
      <div>Name / Email</div>
      <div>Role</div>
      <div>Joined</div>
      <div>Admin</div>
      <div>Actions</div>
    </div>
    ${users.map(u => `
      <div class="room-row" style="grid-template-columns:1fr 100px 120px 100px 140px;">
        <div>
          <div style="font-weight:600;font-size:14px;">${u.name}</div>
          <div style="font-size:12px;color:var(--muted);">${u.contact_email || '—'}</div>
        </div>
        <div>
          <span class="badge ${u.role === 'landlord' ? 'badge-blue' : 'badge-green'}">
            ${u.role}
          </span>
        </div>
        <div style="font-size:12px;color:var(--muted);">
          ${new Date(u.created_at).toLocaleDateString()}
        </div>
        <div>
          <span class="badge ${u.is_admin ? 'badge-yellow' : ''}">
            ${u.is_admin ? 'Admin' : '—'}
          </span>
        </div>
        <div style="display:flex;gap:6px;">
          <button class="btn btn-outline"
                  style="padding:5px 10px;font-size:11px;"
                  onclick="toggleAdminRole('${u.id}',${u.is_admin})">
            ${u.is_admin ? 'Revoke' : 'Make Admin'}
          </button>
          <button class="btn btn-danger"
                  style="padding:5px 10px;font-size:11px;"
                  onclick="deleteUser('${u.id}','${u.name}')">
            Delete
          </button>
        </div>
      </div>`).join('')}`;
}

function filterAdminUsers(q) {
  const rows = document.querySelectorAll('#admin-users-list .room-row:not(.header)');
  rows.forEach(row => {
    const name = row.querySelector('div div')?.textContent?.toLowerCase() || '';
    row.style.display = name.includes(q.toLowerCase()) ? '' : 'none';
  });
}

// ─── ADMIN: ROOMS TAB ────────────────────────────────

async function loadAdminRooms() {
  showAdminTab('rooms');
  const container = document.getElementById('admin-tab-content');
  container.innerHTML = '<p style="color:var(--muted);">Loading rooms...</p>';

  const { data: rooms } = await sb
    .from('rooms')
    .select('*, profiles(name)')
    .order('created_at', { ascending: false });

  container.innerHTML = `
    <div style="font-weight:600;font-size:16px;margin-bottom:16px;">
      All Rooms (${rooms?.length || 0})
    </div>
    <div class="room-list">
      <div class="room-row header"
           style="grid-template-columns:80px 1fr 120px 100px 100px 100px;">
        <div>Room #</div>
        <div>Hostel / Landlord</div>
        <div>Floor</div>
        <div>Price</div>
        <div>Status</div>
        <div>Action</div>
      </div>
      ${(rooms || []).map(r => `
        <div class="room-row"
             style="grid-template-columns:80px 1fr 120px 100px 100px 100px;">
          <div class="room-num">${r.room_number}</div>
          <div>
            <div style="font-weight:600;font-size:13px;">${r.hostel}</div>
            <div style="font-size:11px;color:var(--muted);">
              ${r.profiles?.name || '?'}
            </div>
          </div>
          <div style="font-size:13px;">${r.floor}</div>
          <div style="font-weight:600;color:var(--accent);">
            ZMW ${r.price.toLocaleString()}
          </div>
          <div>
            <span class="badge ${r.status === 'available' ? 'badge-green' : 'badge-red'}">
              ${r.status.toUpperCase()}
            </span>
          </div>
          <div>
            <button class="btn btn-danger"
                    style="padding:5px 10px;font-size:11px;"
                    onclick="adminDeleteRoom('${r.id}')">
              Remove
            </button>
          </div>
        </div>`).join('')}
    </div>`;
}

// ─── ADMIN: REVIEWS TAB ──────────────────────────────

async function loadAdminReviews() {
  showAdminTab('reviews');
  const container = document.getElementById('admin-tab-content');
  container.innerHTML = '<p style="color:var(--muted);">Loading reviews...</p>';

  const { data: reviews } = await sb
    .from('reviews')
    .select('*, profiles(name)')
    .order('created_at', { ascending: false });

  container.innerHTML = `
    <div style="font-weight:600;font-size:16px;margin-bottom:16px;">
      All Reviews (${reviews?.length || 0})
    </div>
    <div class="notif-list">
      ${(reviews || []).map(r => `
        <div class="notif-item">
          <div class="notif-icon">⭐</div>
          <div class="notif-body">
            <div class="notif-title">${r.hostel}</div>
            <div class="notif-sub">
              By ${r.profiles?.name || '?'} ·
              ${renderStars(r.rating)} ·
              ${r.comment || 'No comment'}
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:4px;">
              ${new Date(r.created_at).toLocaleDateString()}
            </div>
          </div>
          <button class="btn btn-danger"
                  style="padding:5px 10px;font-size:11px;flex-shrink:0;"
                  onclick="adminDeleteReview('${r.id}')">
            Delete
          </button>
        </div>`).join('')
        || '<p style="color:var(--muted);padding:20px;">No reviews yet.</p>'}
    </div>`;
}

// ─── ADMIN: DEALS TAB ────────────────────────────────

async function loadAdminDeals() {
  showAdminTab('deals');
  const container = document.getElementById('admin-tab-content');
  container.innerHTML = '<p style="color:var(--muted);">Loading deals...</p>';

  const { data: deals } = await sb
    .from('deals')
    .select('*, rooms(room_number, hostel, price)')
    .order('created_at', { ascending: false });

  const rows = await Promise.all((deals || []).map(async d => {
    const tenant   = await getProfile(d.tenant_id);
    const landlord = await getProfile(d.landlord_id);
    const badges   = {
      confirmed: 'badge-green',
      declined:  'badge-red',
      pending:   'badge-yellow'
    };
    return `
      <div class="notif-item ${d.status === 'pending' ? 'unread' : ''}">
        <div class="notif-icon">🤝</div>
        <div class="notif-body">
          <div class="notif-title">
            Room ${d.rooms?.room_number || '?'} — ${d.rooms?.hostel || '?'}
          </div>
          <div class="notif-sub">
            Tenant: ${tenant?.name || '?'} →
            Landlord: ${landlord?.name || '?'} ·
            ZMW ${d.rooms?.price?.toLocaleString() || '?'}/mo
          </div>
          <div style="margin-top:6px;display:flex;gap:8px;align-items:center;">
            <span class="badge ${badges[d.status]}">${d.status.toUpperCase()}</span>
            <span style="font-size:11px;color:var(--muted);">
              ${new Date(d.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>`;
  }));

  container.innerHTML = `
    <div style="font-weight:600;font-size:16px;margin-bottom:16px;">
      All Deals (${deals?.length || 0})
    </div>
    <div class="notif-list">
      ${rows.join('') || '<p style="color:var(--muted);padding:20px;">No deals yet.</p>'}
    </div>`;
}

// ─── ADMIN ACTIONS ────────────────────────────────────

async function toggleAdminRole(userId, isAdmin) {
  await sb
    .from('profiles')
    .update({ is_admin: !isAdmin })
    .eq('id', userId);
  toast(isAdmin ? 'Admin role revoked.' : 'Admin role granted.', 'success');
  loadAdminUsers();
}

async function deleteUser(userId, userName) {
  if (!confirm(`Are you sure you want to delete ${userName}? This cannot be undone.`)) return;
  await sb.from('profiles').delete().eq('id', userId);
  toast(`${userName} has been deleted.`, 'success');
  loadAdminUsers();
}

async function adminDeleteRoom(roomId) {
  if (!confirm('Are you sure you want to remove this room?')) return;
  await sb.from('rooms').delete().eq('id', roomId);
  toast('Room removed.', 'success');
  loadAdminRooms();
}

async function adminDeleteReview(reviewId) {
  if (!confirm('Are you sure you want to delete this review?')) return;
  await sb.from('reviews').delete().eq('id', reviewId);
  toast('Review deleted.', 'success');
  loadAdminReviews();
}

// ─── TAB SWITCHER ─────────────────────────────────────

function showAdminTab(tab) {
  document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById(`admin-tab-${tab}`);
  if (btn) btn.classList.add('active');
}