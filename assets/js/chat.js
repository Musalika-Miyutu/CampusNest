// ═══════════════════════════════════════════════════════
//  CHAT — messaging between tenants and landlords
// ═══════════════════════════════════════════════════════

// ─── RENDER FULL CHAT LAYOUT ─────────────────────────
// Called when navigating to the messages page

async function renderChat(containerId) {
  const container = document.getElementById(containerId);
  container.innerHTML = '<p style="color:var(--muted);padding:20px;">Loading messages...</p>';

  // Fetch all messages involving the current user
  const { data: msgs } = await sb
    .from('messages')
    .select('*')
    .or(`from_user.eq.${currentUser.id},to_user.eq.${currentUser.id}`)
    .order('created_at', { ascending: true });

  // Find all unique conversation partners
  const contactIds = new Set();
  (msgs || []).forEach(m => {
    if (m.from_user !== currentUser.id) contactIds.add(m.from_user);
    if (m.to_user   !== currentUser.id) contactIds.add(m.to_user);
  });

  // Build conversation list with last message preview
  const contacts = [];
  for (const id of contactIds) {
    const profile = await getProfile(id);
    if (!profile) continue;

    const convMsgs = (msgs || []).filter(m =>
      (m.from_user === currentUser.id && m.to_user === id) ||
      (m.from_user === id && m.to_user === currentUser.id)
    );
    const last = convMsgs[convMsgs.length - 1];

    contacts.push({
      user:     profile,
      lastMsg:  last?.text || '',
      lastTime: fmtTime(last?.created_at),
      msgs:     convMsgs
    });
  }

  // Set the first contact as the active chat
  const firstContact = contacts[0];
  if (firstContact) activeChatWith = firstContact.user.id;

  // Build the full chat layout HTML
  container.innerHTML = `
    <div class="chat-sidebar">
      <div class="chat-search">
        <input placeholder="Search conversations..." oninput="filterChats(this.value,'${containerId}')" />
      </div>
      <div id="${containerId}-conv-list">
        ${contacts.length === 0
          ? '<p style="padding:20px;color:var(--muted);font-size:13px;">No conversations yet.</p>'
          : contacts.map((c, i) => chatItemHTML(c, i === 0, containerId)).join('')}
      </div>
    </div>
    <div class="chat-main" id="${containerId}-chat-main">
      ${contacts.length === 0
        ? `<div class="chat-empty">
             <span style="font-size:40px;opacity:.4;">💬</span>
             <span>No messages yet</span>
           </div>`
        : await buildChatView(firstContact.user, firstContact.msgs, containerId)}
    </div>`;
}

// ─── SINGLE CONVERSATION ITEM IN SIDEBAR ─────────────

function chatItemHTML(conv, isActive, containerId) {
  return `
    <div class="chat-item ${isActive ? 'active' : ''}"
         onclick="openChat('${conv.user.id}','${containerId}')">
      <div class="chat-avatar"
           style="background:${avatarColor(conv.user.id)};color:#111;">
        ${initials(conv.user.name)}
      </div>
      <div class="chat-item-info">
        <div class="chat-item-name">${conv.user.name}</div>
        <div class="chat-item-preview">${conv.lastMsg}</div>
      </div>
      <div class="chat-item-time">${conv.lastTime}</div>
    </div>`;
}

// ─── OPEN A SPECIFIC CONVERSATION ────────────────────

async function openChat(otherId, containerId) {
  activeChatWith = otherId;

  const other = await getProfile(otherId);

  // Fetch messages between current user and this contact
  const { data: msgs } = await sb
    .from('messages')
    .select('*')
    .or(
      `and(from_user.eq.${currentUser.id},to_user.eq.${otherId}),` +
      `and(from_user.eq.${otherId},to_user.eq.${currentUser.id})`
    )
    .order('created_at', { ascending: true });

  // Render the chat view on the right side
  document.getElementById(containerId + '-chat-main').innerHTML =
    await buildChatView(other, msgs || [], containerId);

  // Mark selected conversation as active in sidebar
  document.querySelectorAll(`#${containerId}-conv-list .chat-item`).forEach(el => {
    el.classList.toggle(
      'active',
      el.getAttribute('onclick')?.includes(`'${otherId}'`)
    );
  });
}

// ─── BUILD THE CHAT VIEW (messages + input box) ───────

async function buildChatView(other, msgs, containerId) {
  // Find the room linked to this conversation (from first message with a room)
  const firstRoomId = msgs.find(m => m.room_id)?.room_id;
  const room = firstRoomId ? allRooms.find(r => r.id === firstRoomId) : null;

  return `
    <div class="chat-header">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="chat-avatar"
             style="background:${avatarColor(other.id)};color:#111;">
          ${initials(other.name)}
        </div>
        <div>
          <div class="chat-header-name">${other.name}</div>
          <div class="chat-header-sub">
            ${other.role === 'landlord' ? '🔑 Landlord' : '🎓 Tenant'}
            ${room ? ' · Room ' + room.room_number + ', ' + room.hostel : ''}
          </div>
        </div>
      </div>
      <div style="display:flex;gap:8px;">
        ${currentUser.role === 'tenant' && room && room.status === 'available'
          ? `<button class="btn btn-green"
               onclick="sendDeal(
                 '${other.id}',
                 '${room?.id || ''}',
                 '${room?.hostel?.replace(/'/g, "\\'") || ''}',
                 '${room?.room_number || ''}'
               )">🤝 Propose Deal</button>`
          : ''}
        ${currentUser.role === 'landlord'
          ? `<button class="btn btn-green"
               onclick="confirmDeal('${other.id}')">
               ✅ Confirm Deal
             </button>`
          : ''}
      </div>
    </div>

    <div class="chat-messages" id="${containerId}-messages">
      ${msgs.map(m => {
        const mine   = m.from_user === currentUser.id;
        const sender = mine ? currentUser : other;
        return `
          <div class="msg ${mine ? 'mine' : 'theirs'}">
            <div class="msg-avatar"
                 style="background:${avatarColor(sender.id)};color:#111;">
              ${initials(sender.name)}
            </div>
            <div>
              <div class="msg-bubble">${m.text}</div>
              <div class="msg-time">${fmtTime(m.created_at)}</div>
            </div>
          </div>`;
      }).join('')}
    </div>

    <div class="chat-input-area">
      <textarea
        id="${containerId}-input"
        placeholder="Type a message..."
        rows="1"
        onkeydown="chatKeydown(event,'${containerId}','${other.id}')">
      </textarea>
      <button class="btn btn-primary send-btn"
              onclick="sendMsg('${containerId}','${other.id}')">
        Send ↑
      </button>
    </div>`;
}

// ─── SEND MESSAGE ─────────────────────────────────────

function chatKeydown(e, containerId, otherId) {
  // Send on Enter, allow Shift+Enter for new line
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMsg(containerId, otherId);
  }
}

async function sendMsg(containerId, otherId) {
  const inp  = document.getElementById(containerId + '-input');
  const text = inp.value.trim();
  if (!text) return;

  // Clear input immediately for better UX
  inp.value = '';

  const { error } = await sb.from('messages').insert({
    from_user: currentUser.id,
    to_user:   otherId,
    text
  });

  if (error) {
    toast('Failed to send message. Try again.', 'error');
    return;
  }

  // Refresh the chat view to show the new message
  openChat(otherId, containerId);
}

// ─── FILTER CONVERSATIONS IN SIDEBAR ─────────────────

async function filterChats(q, containerId) {
  // Re-fetch all messages and filter contacts by name
  const { data: msgs } = await sb
    .from('messages')
    .select('*')
    .or(`from_user.eq.${currentUser.id},to_user.eq.${currentUser.id}`)
    .order('created_at', { ascending: true });

  const contactIds = new Set();
  (msgs || []).forEach(m => {
    if (m.from_user !== currentUser.id) contactIds.add(m.from_user);
    if (m.to_user   !== currentUser.id) contactIds.add(m.to_user);
  });

  const contacts = [];
  for (const id of contactIds) {
    const profile = await getProfile(id);
    if (!profile) continue;
    if (q && !profile.name.toLowerCase().includes(q.toLowerCase())) continue;

    const convMsgs = (msgs || []).filter(m =>
      (m.from_user === currentUser.id && m.to_user === id) ||
      (m.from_user === id && m.to_user === currentUser.id)
    );
    const last = convMsgs[convMsgs.length - 1];

    contacts.push({
      user:     profile,
      lastMsg:  last?.text || '',
      lastTime: fmtTime(last?.created_at),
      msgs:     convMsgs
    });
  }

  document.getElementById(containerId + '-conv-list').innerHTML =
    contacts.length === 0
      ? '<p style="padding:20px;color:var(--muted);font-size:13px;">No results found.</p>'
      : contacts.map((c, i) => chatItemHTML(c, false, containerId)).join('');
}