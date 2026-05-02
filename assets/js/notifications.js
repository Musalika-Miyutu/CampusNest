// ═══════════════════════════════════════════════════════
//  NOTIFICATIONS — alerts for landlords and tenants
// ═══════════════════════════════════════════════════════

// ─── CREATE A NOTIFICATION ───────────────────────────
// Called internally whenever an action triggers an alert

async function createNotification(userId, title, message, type = 'system') {
  await sb.from('notifications').insert({
    user_id: userId,
    title,
    message,
    type,
    is_read: false
  });
}

// ─── RENDER NOTIFICATIONS PAGE ───────────────────────

async function renderNotifications() {
  // Find whichever notifications list is currently visible
  const list = document.getElementById('notifications-list');
  if (!list) return;

  list.innerHTML = '<p style="color:var(--muted);">Loading...</p>';

  const { data: notifications, error } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

  if (error) {
    list.innerHTML = '<p style="color:var(--muted);">Failed to load notifications.</p>';
    return;
  }

  if (!notifications?.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔔</div>
        <div class="empty-title">No notifications yet</div>
        <div class="empty-sub">
          You will be notified when someone messages or sends a deal
        </div>
      </div>`;
    return;
  }

  list.innerHTML = notifications.map(n => `
    <div class="notif-item ${n.is_read ? '' : 'unread'}"
         onclick="markAsRead('${n.id}', this)">
      <div class="notif-icon">${getNotifIcon(n.type)}</div>
      <div class="notif-body">
        <div class="notif-title">${n.title}</div>
        <div class="notif-sub">${n.message}</div>
        <div style="margin-top:6px;display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;color:var(--muted);">
            ${formatNotifTime(n.created_at)}
          </span>
          ${!n.is_read
            ? '<span class="badge badge-yellow">New</span>'
            : ''}
        </div>
      </div>
    </div>`).join('');

  updateNotifBadge();
}

// ─── MARK A NOTIFICATION AS READ ─────────────────────

async function markAsRead(notifId, el) {
  await sb
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notifId);

  // Remove unread styling immediately
  el.classList.remove('unread');
  const badge = el.querySelector('.badge-yellow');
  if (badge) badge.remove();

  updateNotifBadge();
}

// ─── MARK ALL NOTIFICATIONS AS READ ──────────────────

async function markAllRead() {
  await sb
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', currentUser.id)
    .eq('is_read', false);

  toast('All notifications marked as read.', 'success');
  renderNotifications();
}

// ─── UPDATE NOTIFICATION BADGE IN SIDEBAR ────────────

async function updateNotifBadge() {
  if (!currentUser) return;

  const { count } = await sb
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .eq('is_read', false);

  // Handle both tenant and landlord badge IDs
  const badgeT = document.getElementById('notif-badge-t');
  const badgeL = document.getElementById('notif-badge-l');

  if (badgeT) {
    badgeT.textContent = count || 0;
    badgeT.classList.toggle('hidden', !count);
  }
  if (badgeL) {
    badgeL.textContent = count || 0;
    badgeL.classList.toggle('hidden', !count);
  }
}

// ─── SUBSCRIBE TO REAL-TIME NOTIFICATIONS ────────────

function subscribeToNotifications() {
  sb.channel(`notifications-${currentUser.id}`)
    .on(
      'postgres_changes',
      {
        event:  'INSERT',
        schema: 'public',
        table:  'notifications',
        filter: `user_id=eq.${currentUser.id}`
      },
      (payload) => {
        updateNotifBadge();
        // Show toast for the incoming notification
        toast(`🔔 ${payload.new.title}`, 'success');
        // If they are on notifications page refresh it
        if (activeView === 't-notifications') renderNotifications();
        if (activeView === 'l-notifications') renderNotifications();
      }
    )
    .subscribe();
}

// ─── HELPERS ─────────────────────────────────────────

function getNotifIcon(type) {
  const icons = {
    enquiry: '🏠',
    deal:    '🤝',
    message: '💬',
    system:  '🔔'
  };
  return icons[type] || '🔔';
}

function formatNotifTime(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const now  = new Date();
  const diff = Math.floor((now - date) / 1000); // seconds

  if (diff < 60)   return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  return date.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric'
  });
}