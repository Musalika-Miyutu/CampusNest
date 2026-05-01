// ═══════════════════════════════════════════════════════
//  REVIEWS — rating and review system for hostels
// ═══════════════════════════════════════════════════════

// ─── RENDER REVIEWS FOR A HOSTEL ─────────────────────

async function renderReviews(hostelName) {
  const container = document.getElementById('reviews-container');
  if (!container) return;

  container.innerHTML = '<p style="color:var(--muted);">Loading reviews...</p>';

  const { data: reviews } = await sb
    .from('reviews')
    .select('*, profiles(name, avatar_url)')
    .eq('hostel', hostelName)
    .order('created_at', { ascending: false });

  if (!reviews?.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">⭐</div>
        <div class="empty-title">No reviews yet</div>
        <div class="empty-sub">Be the first to review this hostel</div>
      </div>`;
    return;
  }

  // Calculate average rating
  const avg = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

  container.innerHTML = `
    <div class="reviews-summary">
      <div class="reviews-avg">${avg.toFixed(1)}</div>
      <div>
        <div class="reviews-stars">${renderStars(avg)}</div>
        <div style="font-size:13px;color:var(--muted);margin-top:4px;">
          Based on ${reviews.length} review${reviews.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
    <div class="reviews-list">
      ${reviews.map(r => `
        <div class="review-card">
          <div class="review-header">
            <div style="display:flex;align-items:center;gap:10px;">
              <div class="chat-avatar"
                   style="width:36px;height:36px;background:${avatarColor(r.tenant_id)};
                          color:#111;border-radius:50%;display:flex;align-items:center;
                          justify-content:center;font-weight:700;font-size:13px;">
                ${initials(r.profiles?.name || '?')}
              </div>
              <div>
                <div style="font-weight:600;font-size:14px;">
                  ${r.profiles?.name || 'Anonymous'}
                </div>
                <div style="font-size:11px;color:var(--muted);">
                  ${formatNotifTime(r.created_at)}
                </div>
              </div>
            </div>
            <div class="review-stars">${renderStars(r.rating)}</div>
          </div>
          ${r.comment
            ? `<div class="review-comment">${r.comment}</div>`
            : ''}
        </div>`).join('')}
    </div>`;
}

// ─── RENDER STAR RATING INPUT ────────────────────────

function renderStarInput(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  let selectedRating = 0;

  container.innerHTML = `
    <div class="star-input" id="star-input-row">
      ${[1,2,3,4,5].map(i => `
        <span class="star"
              data-val="${i}"
              onclick="selectStar(${i})"
              onmouseover="hoverStar(${i})"
              onmouseout="unhoverStar()">
          ☆
        </span>`).join('')}
    </div>`;
}

// ─── STAR INTERACTION ────────────────────────────────

let selectedRating = 0;

function selectStar(val) {
  selectedRating = val;
  updateStarDisplay(val);
}

function hoverStar(val) {
  updateStarDisplay(val);
}

function unhoverStar() {
  updateStarDisplay(selectedRating);
}

function updateStarDisplay(val) {
  document.querySelectorAll('.star-input .star').forEach((star, i) => {
    star.textContent = i < val ? '★' : '☆';
    star.style.color = i < val ? '#e8c36a' : 'var(--muted)';
  });
}

// ─── SUBMIT A REVIEW ─────────────────────────────────

async function submitReview(hostelName, landlordId) {
  if (!selectedRating) {
    toast('Please select a star rating.', 'error');
    return;
  }

  const comment = document.getElementById('review-comment').value.trim();

  // Check if tenant already reviewed this hostel
  const { data: existing } = await sb
    .from('reviews')
    .select('id')
    .eq('tenant_id', currentUser.id)
    .eq('hostel', hostelName)
    .maybeSingle();

  if (existing) {
    // Update existing review
    const { error } = await sb
      .from('reviews')
      .update({ rating: selectedRating, comment })
      .eq('id', existing.id);

    if (error) { toast('Failed to update review.', 'error'); return; }
    toast('Review updated!', 'success');
  } else {
    // Insert new review
    const { error } = await sb
      .from('reviews')
      .insert({
        tenant_id:   currentUser.id,
        hostel:      hostelName,
        landlord_id: landlordId,
        rating:      selectedRating,
        comment
      });

    if (error) { toast('Failed to submit review.', 'error'); return; }

    // Notify the landlord
    await createNotification(
      landlordId,
      'New Review Received',
      `Someone left a ${selectedRating}-star review for ${hostelName}`,
      'system'
    );

    toast('Review submitted! Thank you.', 'success');
  }

  // Reset form
  selectedRating = 0;
  document.getElementById('review-comment').value = '';
  updateStarDisplay(0);

  // Refresh reviews
  renderReviews(hostelName);
}

// ─── RENDER STATIC STARS (display only) ──────────────

function renderStars(rating) {
  const full    = Math.floor(rating);
  const partial = rating % 1 >= 0.5 ? 1 : 0;
  const empty   = 5 - full - partial;

  return `<span style="color:#e8c36a;font-size:16px;">
    ${'★'.repeat(full)}${'½'.repeat(partial)}${'☆'.repeat(empty)}
  </span>`;
}

// ─── GET AVERAGE RATING FOR A HOSTEL ─────────────────

async function getHostelRating(hostelName) {
  const { data } = await sb
    .from('reviews')
    .select('rating')
    .eq('hostel', hostelName);

  if (!data?.length) return null;

  const avg = data.reduce((sum, r) => sum + r.rating, 0) / data.length;
  return { avg: avg.toFixed(1), count: data.length };
}