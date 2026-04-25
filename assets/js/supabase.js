// ═══════════════════════════════════════════════════════
//  SUPABASE CLIENT — central connection to your database
// ═══════════════════════════════════════════════════════

const SUPABASE_URL = 'https://adskcfrecdjbuldwdihh.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFkc2tjZnJlY2RqYnVsZHdkaWhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzcwMjI1MjIsImV4cCI6MjA5MjU5ODUyMn0.3uKZ508-dZ7MiodDVKAbISQzJrrFFjR63h4H14ouZAo';

const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════
//  SHARED STATE — accessible across all JS files
// ═══════════════════════════════════════════════════════

let currentUser  = null;   // logged-in user object
let currentRole  = 'tenant'; // selected role on auth screen
let activeView   = '';     // which page/view is currently showing
let activeChatWith = null; // who the user is currently chatting with
let allRooms     = [];     // local cache of rooms from DB
let allProfiles  = {};     // cache of profiles { id: profileObject }
let realtimeChannel = null;

// ═══════════════════════════════════════════════════════
//  PROFILE HELPER — fetch & cache a user profile by id
// ═══════════════════════════════════════════════════════

async function getProfile(id) {
  if (!id) return null;
  if (allProfiles[id]) return allProfiles[id];
  const { data } = await sb.from('profiles').select('*').eq('id', id).single();
  if (data) allProfiles[id] = data;
  return data;
}

// ═══════════════════════════════════════════════════════
//  UTILITY HELPERS
// ═══════════════════════════════════════════════════════

// Show a toast notification at bottom-right
function toast(msg, type = 'success') {
  const area = document.getElementById('toast-area');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span>${type === 'success' ? '✅' : '❌'}</span> ${msg}`;
  area.appendChild(el);
  setTimeout(() => el.remove(), 3500);
}

// Format a timestamp like "10:32 AM"
function fmtTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Generate a consistent colour for a user avatar based on their ID
const AVATAR_COLORS = ['#5b8dee', '#e8c36a', '#4ecb8d', '#f06b6b', '#a78bfa', '#fb923c'];
function avatarColor(id) {
  let h = 0;
  for (let c of (id || '')) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// Get initials from a full name e.g. "Alex Mwale" → "AM"
function initials(name) {
  return (name || '?').split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

// Return today's date as a readable string
function today() {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

// Hostel icon mapper — auto assigns an emoji to each hostel name
const HOSTEL_ICONS = {};
function getHostelIcon(name) {
  if (!HOSTEL_ICONS[name]) {
    const icons = ['🌅', '🌿', '🏘', '🏠', '🌇', '🌳', '🏡', '🌄'];
    HOSTEL_ICONS[name] = icons[Object.keys(HOSTEL_ICONS).length % icons.length];
  }
  return HOSTEL_ICONS[name];
}

// Update the message badge count in the sidebar
async function updateMsgBadges() {
  if (!currentUser) return;
  const { count } = await sb
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('to_user', currentUser.id);
  const badgeEl = currentUser.role === 'tenant' ? 't-msg-badge' : 'l-msg-badge';
  const el = document.getElementById(badgeEl);
  if (el) {
    el.textContent = count || 0;
    el.classList.toggle('hidden', !count);
  }
}