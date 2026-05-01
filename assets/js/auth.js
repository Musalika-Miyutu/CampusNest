// ═══════════════════════════════════════════════════════
//  AUTH — login, register, logout
// ═══════════════════════════════════════════════════════

// Show the auth modal with the correct role and view (login/register)
function showAuth(role, view) {
  currentRole = role;
  document.getElementById('auth-modal').classList.remove('hidden');
  const btns = document.querySelectorAll('.modal-toggle-btn');
  btns[0].classList.toggle('active', role === 'tenant');
  btns[1].classList.toggle('active', role === 'landlord');
  switchAuthView(view);
}

function closeAuth() {
  document.getElementById('auth-modal').classList.add('hidden');
}

function closeAuthIfBg(e) {
  if (e.target === document.getElementById('auth-modal')) closeAuth();
}

function switchAuthView(v) {
  document.getElementById('auth-login-view').classList.toggle('hidden', v !== 'login');
  document.getElementById('auth-register-view').classList.toggle('hidden', v !== 'register');
}

// Switch between Tenant / Landlord role on the auth modal
function setRole(r) {
  currentRole = r;
  const btns = document.querySelectorAll('.modal-toggle-btn');
  btns[0].classList.toggle('active', r === 'tenant');
  btns[1].classList.toggle('active', r === 'landlord');
}

// Show an inline error message inside the form
function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4000);
}

// ─── REGISTER ────────────────────────────────────────
async function doRegister() {
  const first = document.getElementById('reg-first').value.trim();
  const last  = document.getElementById('reg-last').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const pass  = document.getElementById('reg-pass').value;

  if (!first || !last || !email || !pass) {
    showError('reg-error', 'Please fill in all fields.');
    return;
  }
  if (pass.length < 6) {
    showError('reg-error', 'Password must be at least 6 characters.');
    return;
  }

  // Create the auth account in Supabase
  const { data, error } = await sb.auth.signUp({ email, password: pass });
  if (error) { showError('reg-error', error.message); return; }

  // Save their name and role in the profiles table
  const { error: profileError } = await sb.from('profiles').insert({
    id:   data.user.id,
    name: `${first} ${last}`,
    role: currentRole
  });

  if (profileError) {
    showError('reg-error', 'Account created but profile failed. Try logging in.');
    return;
  }

  toast('Account created! You are now logged in.', 'success');
  await loginAs({
    id:    data.user.id,
    name:  `${first} ${last}`,
    role:  currentRole,
    email
  });
}

// ─── LOGIN ────────────────────────────────────────────
async function doLogin() {
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-pass').value;

  if (!email || !pass) {
    showError('login-error', 'Please enter your email and password.');
    return;
  }

  const { data, error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { showError('login-error', 'Incorrect email or password.'); return; }

  // Fetch their profile to get name and role
  const { data: profile, error: profErr } = await sb
    .from('profiles')
    .select('*')
    .eq('id', data.user.id)
    .single();

  if (profErr || !profile) {
    showError('login-error', 'Profile not found. Please register first.');
    return;
  }

  // Make sure they selected the correct role
  if (profile.role !== currentRole) {
    showError('login-error', `This account is registered as a ${profile.role}. Please select the correct role.`);
    await sb.auth.signOut();
    return;
  }

  await loginAs({
    id:    profile.id,
    name:  profile.name,
    role:  profile.role,
    email: data.user.email
  });
}

// ─── LOGIN AS (shared by login + register) ────────────
async function loginAs(user) {
  currentUser = user;
  closeAuth();

  // Cache their own profile
  allProfiles[user.id] = user;

  // Pre-load all rooms into local cache
  const { data: rooms } = await sb.from('rooms').select('*');
  allRooms = rooms || [];

  // Show the app, hide the landing page
  document.getElementById('page-landing').classList.add('hidden');
  document.getElementById('page-app').classList.remove('hidden');

  // Update sidebar with user info
  document.getElementById('sb-name').textContent = user.name;
  document.getElementById('sb-role').textContent = user.role === 'landlord' ? 'Landlord' : 'Tenant';

  // Show correct nav items for their role
  document.getElementById('nav-tenant').classList.toggle('hidden', user.role !== 'tenant');
  document.getElementById('nav-landlord').classList.toggle('hidden', user.role !== 'landlord');

  // Go to their home screen
  if (user.role === 'tenant') navTo('t-browse');
  else navTo('l-dashboard');

  updateMsgBadges();
  subscribeToMessages();
  subscribeToNotifications();
}

// ─── LOGOUT ──────────────────────────────────────────
async function doLogout() {
  await sb.auth.signOut();
  if (realtimeChannel) sb.removeChannel(realtimeChannel);

  // Reset all state
  currentUser    = null;
  allRooms       = [];
  allProfiles    = {};
  realtimeChannel = null;

  document.getElementById('page-app').classList.add('hidden');
  document.getElementById('page-landing').classList.remove('hidden');
  toast('Signed out successfully.', 'success');
}

// ─── REAL-TIME MESSAGE SUBSCRIPTION ──────────────────
function subscribeToMessages() {
  realtimeChannel = sb.channel('public:messages')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'messages' },
      async (payload) => {
        const msg = payload.new;
        if (msg.to_user === currentUser.id) {
          updateMsgBadges();
          toast('New message received!', 'success');
          // If they are currently on the messages page, refresh it
          if (activeView === 't-messages') renderChat('t-chat-layout');
          if (activeView === 'l-messages') renderChat('l-chat-layout');
        }
      }
    )
    .subscribe();
}