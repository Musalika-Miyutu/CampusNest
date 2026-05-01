// ═══════════════════════════════════════════════════════
//  PROFILE — view and update user profile details
// ═══════════════════════════════════════════════════════

// ─── RENDER PROFILE PAGE ─────────────────────────────

async function renderProfile() {
  const container = document.getElementById('view-profile');
  if (!container) return;

  const { data: profile } = await sb
    .from('profiles')
    .select('*')
    .eq('id', currentUser.id)
    .single();

  document.getElementById('profile-name').textContent    = profile.name    || '—';
  document.getElementById('profile-role').textContent    = profile.role    || '—';
  document.getElementById('profile-email').textContent   = currentUser.email || '—';

  document.getElementById('edit-name').value          = profile.name          || '';
  document.getElementById('edit-phone').value         = profile.phone         || '';
  document.getElementById('edit-bio').value           = profile.bio           || '';
  document.getElementById('edit-contact-email').value = profile.contact_email || '';

  // Show avatar if exists
  if (profile.avatar_url) {
    document.getElementById('profile-avatar-img').src = profile.avatar_url;
    document.getElementById('profile-avatar-img').classList.remove('hidden');
    document.getElementById('profile-avatar-placeholder').classList.add('hidden');
  } else {
    document.getElementById('profile-avatar-img').classList.add('hidden');
    document.getElementById('profile-avatar-placeholder').classList.remove('hidden');
    document.getElementById('profile-avatar-placeholder').textContent = initials(profile.name);
  }
}

// ─── SAVE PROFILE CHANGES ────────────────────────────

async function saveProfile() {
  const name          = document.getElementById('edit-name').value.trim();
  const phone         = document.getElementById('edit-phone').value.trim();
  const bio           = document.getElementById('edit-bio').value.trim();
  const contact_email = document.getElementById('edit-contact-email').value.trim();

  if (!name) { toast('Name cannot be empty.', 'error'); return; }

  // Handle avatar upload if a file was selected
  let avatar_url = null;
  const avatarFile = document.getElementById('edit-avatar').files[0];
  if (avatarFile) {
    avatar_url = await uploadAvatar(avatarFile);
    if (!avatar_url) return; // upload failed, error already shown
  }

  const updates = { name, phone, bio, contact_email };
  if (avatar_url) updates.avatar_url = avatar_url;

  const { error } = await sb
    .from('profiles')
    .update(updates)
    .eq('id', currentUser.id);

  if (error) { toast('Failed to save profile. Try again.', 'error'); return; }

  // Update local state
  currentUser.name = name;
  allProfiles[currentUser.id] = { ...allProfiles[currentUser.id], ...updates };
  document.getElementById('sb-name').textContent = name;

  toast('Profile updated successfully!', 'success');
  renderProfile();
}

// ─── UPLOAD AVATAR IMAGE ─────────────────────────────

async function uploadAvatar(file) {
  const ext      = file.name.split('.').pop();
  const filePath = `${currentUser.id}/avatar.${ext}`;

  const { error } = await sb.storage
    .from('hostel-images')
    .upload(filePath, file, { upsert: true });

  if (error) { toast('Failed to upload avatar. Try again.', 'error'); return null; }

  const { data } = sb.storage
    .from('hostel-images')
    .getPublicUrl(filePath);

  return data.publicUrl;
}

// ─── TOGGLE EDIT MODE ────────────────────────────────

function toggleEditMode() {
  const viewMode = document.getElementById('profile-view-mode');
  const editMode = document.getElementById('profile-edit-mode');
  const isEditing = editMode.classList.contains('hidden');
  viewMode.classList.toggle('hidden', isEditing);
  editMode.classList.toggle('hidden', !isEditing);
}