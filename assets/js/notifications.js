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
  const list = document.getElementById('notifications-list');
  list.innerHTML = '<p style="color:var(--muted);">Loading...</p>';

  const { data: notifications } = await sb
    .from('notifications')
    .select('*')
    .eq('user_id', currentUser.id)
    .order('created_at', { ascending: false });

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
         onclick="markAsRead('${n.id}',this)">
      <div class="notif-icon">${getNotifIcon(n.type)}</div>
      <div class="notif-body">
        <div class="notif-title">${n.title}</div>
        <div class="notif-sub">${n.message}</div>
        <div style="margin-top:6px;">
          <span style="font-size:11px;color:var(--muted);">
            ${formatNotifTime(n.created_at)}
          </span>
          ${!n.is_read
            ? '<span class="badge badge-yellow" style="margin-left:8px;">New</span>'
            : ''}
        </div>
      </div>
    </div>`).join('');

  // Update notification badge count
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
  const { count } = await sb
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', currentUser.id)
    .eq('is_read', false);

  const badge = document.getElementById('notif-badge');
  if (badge) {
    badge.textContent  = count || 0;
    badge.classList.toggle('hidden', !count);
  }
}

// ─── SUBSCRIBE TO REAL-TIME NOTIFICATIONS ────────────

function subscribeToNotifications() {
  sb.channel('public:notifications')
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
        toast(`🔔 ${payload.new.title}`, 'success');
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