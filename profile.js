import { supabase } from "./supabase.js";

const params = new URLSearchParams(window.location.search);
let farmName = params.get("farm") || params.get("farmName") || "Local Farm";
let farmerEmail = params.get("email") || "farmer@freshlink.co";
let farmLocation = params.get("location") || "Nearby region";
let farmCategory = params.get("farm_category") || params.get("category") || "";
let farmSpecialization = params.get("specialization") || "";
let bannerImage = params.get("banner") || `https://source.unsplash.com/900x600/?farm,${encodeURIComponent(farmName)}`;
let avatarImage = params.get("avatar") || `https://source.unsplash.com/200x200/?farmer,${encodeURIComponent(farmName)}`;
let bio = params.get("bio") || "Fresh local farm offering seasonal produce, direct from the field to your table.";
let farmHandle = params.get("handle") || params.get("username") || "";
let contactNumber = params.get("contact") || "+27 000 000 0000";

const profileBanner = document.getElementById("profileBanner");
const profileAvatar = document.querySelector("#profileAvatar img");
const profileName = document.getElementById("profileName");
const profileHandle = document.getElementById("profileHandle");
const profileBio = document.getElementById("profileBio");
const profileCategory = document.getElementById("profileCategory");
const profileSpecialization = document.getElementById("profileSpecialization");
const profileLocation = document.getElementById("profileLocation");
const profilePostsCount = document.getElementById("profilePostsCount");
const profileGrowCount = document.getElementById("profileGrowCount");
const profilePosts = document.getElementById("profilePosts");
const profileGrowVideos = document.getElementById("profileGrowVideos");
const emptyProfileMessage = document.getElementById("emptyProfileMessage");
const emptyGrowMessage = document.getElementById("emptyGrowMessage");
const uploadProfileBtn = document.getElementById("uploadProfileBtn");
const followBtn = document.getElementById("followBtn");
const editProfileBtn = document.getElementById("editProfileBtn");
const editProfileModal = document.getElementById("editProfileModal");
const editFarmName = document.getElementById("editFarmName");
const editUsername = document.getElementById("editUsername");
const editLocation = document.getElementById("editLocation");
const editFarmCategory = document.getElementById("editFarmCategory");
const editSpecialization = document.getElementById("editSpecialization");
const editBio = document.getElementById("editBio");
const editAvatar = document.getElementById("editAvatar");
const editBanner = document.getElementById("editBanner");
const saveProfileBtn = document.getElementById("saveProfileBtn");
const cancelEditBtn = document.getElementById("cancelEditBtn");
const editProfileMsg = document.getElementById("editProfileMsg");
const requestVerificationBtn = document.getElementById("requestVerificationBtn");
const payoutSetupBtn = document.getElementById("payoutSetupBtn");
const verificationBadge = document.getElementById("verificationBadge");

const uploadProfileModal = document.getElementById("uploadProfileModal");
const pTitle = document.getElementById("pTitle");
const pAmount = document.getElementById("pAmount");
const pUnitPrice = document.getElementById("pUnitPrice");
const pTotalPrice = document.getElementById("pTotalPrice");
const pContact = document.getElementById("pContact");
const pImage = document.getElementById("pImage");
const uploadFromProfileBtn = document.getElementById("uploadFromProfileBtn");
const cancelUploadBtn = document.getElementById("cancelUploadBtn");
const uploadProfileMsg = document.getElementById("uploadProfileMsg");
const ownerActions = document.getElementById("ownerActions");
const profileOwnerNote = document.getElementById("profileOwnerNote");
const ownerQuickBar = document.getElementById("ownerQuickBar");
const quickUploadBtn = document.getElementById("quickUploadBtn");
const quickGrowBtn = document.getElementById("quickGrowBtn");
const quickEditBtn = document.getElementById("quickEditBtn");

let currentUser = null;
let isOwnerProfile = false;
let viewedProfileId = null;

const FARM_CATEGORIES = new Set([
    "Crop Farming",
    "Livestock Farming",
    "Poultry Farming",
    "Dairy Farming",
    "Horticulture",
    "Aquaculture",
    "Mixed Farming",
    "Organic Farming"
]);

async function initProfilePage() {
    const { data } = await supabase.auth.getSession();
    currentUser = data?.session?.user || null;
    if (!farmerEmail && currentUser?.email) {
        farmerEmail = currentUser.email;
    }
    isOwnerProfile = Boolean(currentUser && currentUser.email === farmerEmail);

    // Pre-fill edit form
    editFarmName.value = farmName || '';
    editUsername.value = farmHandle || '';
    editLocation.value = farmLocation || '';
    if (editFarmCategory) editFarmCategory.value = farmCategory || '';
    if (editSpecialization) editSpecialization.value = farmSpecialization || '';
    editBio.value = bio || '';

    updateOwnerControls();

    // Wire buttons
    if (editProfileBtn) editProfileBtn.addEventListener('click', () => { editProfileModal.style.display = 'flex'; });
    if (cancelEditBtn) cancelEditBtn.addEventListener('click', () => { editProfileModal.style.display = 'none'; });
    if (saveProfileBtn) saveProfileBtn.addEventListener('click', saveProfile);

    if (uploadProfileBtn) uploadProfileBtn.addEventListener('click', () => { uploadProfileModal.style.display = 'flex'; });
    if (cancelUploadBtn) cancelUploadBtn.addEventListener('click', () => { uploadProfileModal.style.display = 'none'; });
    if (uploadFromProfileBtn) uploadFromProfileBtn.addEventListener('click', uploadFromProfile);

    if (quickUploadBtn) quickUploadBtn.addEventListener('click', () => { uploadProfileModal.style.display = 'flex'; });
    if (quickGrowBtn) quickGrowBtn.addEventListener('click', () => { window.location.href = 'grow-upload.html'; });
    if (quickEditBtn) quickEditBtn.addEventListener('click', () => { editProfileModal.style.display = 'flex'; });
    if (requestVerificationBtn) requestVerificationBtn.addEventListener('click', requestVerification);
    if (payoutSetupBtn) payoutSetupBtn.addEventListener('click', startPayoutOnboarding);

    await loadProfileData();
    await loadProfilePosts();
    await loadGrowVideos();
    await refreshFollowButtonState();
}

function updateOwnerControls() {
    if (isOwnerProfile) {
        if (ownerActions) ownerActions.style.display = 'flex';
        if (ownerQuickBar) ownerQuickBar.style.display = 'grid';
        if (followBtn) followBtn.style.display = 'none';
        if (profileOwnerNote) profileOwnerNote.textContent = 'You are viewing your farm profile. Use the buttons to post produce and update your story.';
    } else {
        if (ownerActions) ownerActions.style.display = 'none';
        if (ownerQuickBar) ownerQuickBar.style.display = 'none';
        if (followBtn) followBtn.style.display = 'inline-flex';
        if (profileOwnerNote) profileOwnerNote.textContent = 'Follow this farm to receive updates and new produce listings.';
    }
}

function escapeHtmlProfile(text) {
    if (!text) return "";
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function isValidUrl(url) {
    try {
        new URL(url || "");
        return true;
    } catch {
        return false;
    }
}

function normalizeFarmCategory(value) {
    const category = String(value || "").trim();
    if (!category) return "";
    return FARM_CATEGORIES.has(category) ? category : "";
}

function normalizeSpecialization(value) {
    return String(value || "").trim().substring(0, 120);
}

function normalizeUsername(value) {
    const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "");
    return normalized.substring(0, 30);
}

function refreshFarmTags() {
    if (profileCategory) {
        profileCategory.textContent = `Category: ${farmCategory || "Not set"}`;
    }
    if (profileSpecialization) {
        profileSpecialization.textContent = `Specialisation: ${farmSpecialization || "Not set"}`;
    }
}

async function loadProfileData() {
    if (!currentUser || !isOwnerProfile) {
        if (!farmerEmail) return;

        const { data } = await supabase.rpc('get_profile_preview', { _email: farmerEmail });
        const profile = Array.isArray(data) ? data[0] : data;
        if (!profile) return;

        farmName = profile.farm_name || farmName;
        farmLocation = profile.location || farmLocation;
        bio = profile.bio || bio;
        viewedProfileId = profile.id || viewedProfileId;
        farmHandle = normalizeUsername(profile.username || profile.handle || farmHandle);
        farmCategory = normalizeFarmCategory(profile.farm_category || farmCategory);
        farmSpecialization = normalizeSpecialization(profile.specialization || farmSpecialization);
        bannerImage = (isValidUrl(profile.banner_url) ? profile.banner_url : null) || bannerImage;
        avatarImage = (isValidUrl(profile.avatar_url) ? profile.avatar_url : null) || avatarImage;

        if (profileName) profileName.textContent = escapeHtmlProfile(farmName);
        if (profileHandle) profileHandle.textContent = farmHandle ? `@${farmHandle}` : "@yourusername";
        if (profileBio) profileBio.textContent = escapeHtmlProfile(bio);
        if (profileLocation) profileLocation.textContent = escapeHtmlProfile(farmLocation);
        if (profileBanner) profileBanner.src = bannerImage;
        if (profileAvatar) profileAvatar.src = avatarImage;

        refreshFarmTags();
        await refreshVerificationStatus();
        return;
    }

    let profile = null;
    let error = null;

    const resultWithNewFields = await supabase
        .from('profiles')
        .select('farm_name,avatar_url,banner_url,location,bio,farm_category,specialization,username')
        .eq('id', currentUser.id)
        .single();

    profile = resultWithNewFields.data;
    error = resultWithNewFields.error;

    if (error) {
        const fallbackResult = await supabase
            .from('profiles')
            .select('farm_name,avatar_url,banner_url,location,bio,farm_category,specialization')
            .eq('id', currentUser.id)
            .single();

        profile = fallbackResult.data;
        error = fallbackResult.error;
    }

    if (error || !profile) return;

    viewedProfileId = currentUser.id;
    farmName = profile.farm_name || farmName;
    farmHandle = normalizeUsername(profile.username || profile.handle || farmHandle);
    farmLocation = profile.location || farmLocation;
    bio = profile.bio || bio;
    farmCategory = normalizeFarmCategory(profile.farm_category || farmCategory);
    farmSpecialization = normalizeSpecialization(profile.specialization || farmSpecialization);
    bannerImage = (isValidUrl(profile.banner_url) ? profile.banner_url : null) || bannerImage;
    avatarImage = (isValidUrl(profile.avatar_url) ? profile.avatar_url : null) || avatarImage;

    if (profileName) profileName.textContent = escapeHtmlProfile(farmName);
    if (profileHandle) profileHandle.textContent = farmHandle ? `@${farmHandle}` : "@yourusername";
    if (profileBio) profileBio.textContent = escapeHtmlProfile(bio);
    if (profileLocation) profileLocation.textContent = escapeHtmlProfile(farmLocation);
    if (profileBanner) profileBanner.src = bannerImage;
    if (profileAvatar) profileAvatar.src = avatarImage;
    if (editFarmName) editFarmName.value = farmName;
    if (editUsername) editUsername.value = farmHandle;
    if (editLocation) editLocation.value = farmLocation;
    if (editFarmCategory) editFarmCategory.value = farmCategory;
    if (editSpecialization) editSpecialization.value = farmSpecialization;
    if (editBio) editBio.value = bio;

    refreshFarmTags();
    await refreshVerificationStatus();
}

async function refreshVerificationStatus() {
    if (!verificationBadge) return;

    let badgeMeta = { visible: false, label: "" };
    const subscriptionTools = window.FreshLinkSubscription;
    if (subscriptionTools) {
        if (isOwnerProfile) {
            const state = await subscriptionTools.getCurrentSubscriptionState();
            badgeMeta = subscriptionTools.getSubscriptionBadgeMeta(state.tier);
        } else if (farmerEmail) {
            const { data } = await supabase.rpc('get_profile_preview', { _email: farmerEmail });
            const profile = Array.isArray(data) ? data[0] : data;
            badgeMeta = subscriptionTools.getSubscriptionBadgeMeta(profile?.subscription_tier);
        }
    }

    const requestEmail = (isOwnerProfile ? currentUser?.email : farmerEmail) || farmerEmail;
    let request = null;
    if (requestEmail) {
        const { data } = await supabase
            .from("verification_requests")
            .select("status")
            .eq("email", requestEmail)
            .order("created_at", { ascending: false })
            .limit(1);
        request = Array.isArray(data) && data.length ? data[0] : null;
    }

    if (badgeMeta.visible) {
        verificationBadge.textContent = `✓ ${badgeMeta.label}`;
        verificationBadge.style.display = "block";
    } else if (request?.status === "approved") {
        verificationBadge.textContent = "✓ Verified farmer/supplier";
        verificationBadge.style.display = "block";
    } else {
        verificationBadge.style.display = "none";
    }
}

async function startPayoutOnboarding() {
    if (!currentUser) {
        editProfileMsg.textContent = 'Sign in first to set up payouts.';
        return;
    }

    if (payoutSetupBtn) payoutSetupBtn.disabled = true;
    editProfileMsg.textContent = 'Opening secure payout onboarding...';

    try {
        const response = await fetch('/api/payments/onboard-seller', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sellerEmail: currentUser.email,
                sellerName: farmName || 'FreshLink seller',
                sellerId: currentUser.id,
                returnUrl: `${window.location.origin}/profile.html?payment=success`,
                refreshUrl: `${window.location.origin}/profile.html?payment=retry`
            })
        });

        const payload = await response.json();
        if (!payload?.ok || !payload.url) {
            throw new Error(payload?.error || 'Unable to start onboarding.');
        }

        window.location.href = payload.url;
    } catch (error) {
        editProfileMsg.textContent = error.message || 'Unable to start payout onboarding.';
        if (payoutSetupBtn) payoutSetupBtn.disabled = false;
    }
}

async function requestVerification() {
    if (!currentUser) {
        editProfileMsg.textContent = 'Sign in first to request verification.';
        return;
    }

    const { data: existingRequests, error: lookupError } = await supabase
        .from('verification_requests')
        .select('id,status')
        .eq('email', currentUser.email)
        .order('created_at', { ascending: false })
        .limit(1);

    if (!lookupError && Array.isArray(existingRequests) && existingRequests.length) {
        editProfileMsg.textContent = 'You already submitted a verification request.';
        return;
    }

    const { error } = await supabase.from('verification_requests').insert([{
        requester_id: currentUser.id,
        email: currentUser.email,
        farm_name: farmName || currentUser.email,
        role: 'farmer/supplier',
        status: 'pending'
    }]);

    if (error) {
        editProfileMsg.textContent = error.message || 'Unable to send verification request.';
        return;
    }

    editProfileMsg.textContent = 'Verification request sent. The admin team will review it.';
    await refreshVerificationStatus();
}

async function saveProfile() {
    if (!currentUser) {
        editProfileMsg.textContent = 'You must be signed in to edit profile.';
        return;
    }

    saveProfileBtn.disabled = true;
    editProfileMsg.textContent = 'Saving...';

    const farm_name = editFarmName.value.trim();
    const username = normalizeUsername(editUsername?.value || "");
    const location = editLocation.value.trim();
    const category = normalizeFarmCategory(editFarmCategory?.value || "");
    const specialization = normalizeSpecialization(editSpecialization?.value || "");
    const bioText = editBio.value.trim();

    // upload avatar/banner if provided
    let avatar_url = profileAvatar.src;
    let banner_url = profileBanner.src;

    if (editAvatar.files && editAvatar.files[0]) {
        const f = editAvatar.files[0];
        const fileName = `avatars/${currentUser.id}_${Date.now()}_${f.name}`;
        const { error: upErr } = await supabase.storage.from('farm-images').upload(fileName, f);
        if (!upErr) avatar_url = supabase.storage.from('farm-images').getPublicUrl(fileName).data.publicUrl;
    }

    if (editBanner.files && editBanner.files[0]) {
        const f = editBanner.files[0];
        const fileName = `banners/${currentUser.id}_${Date.now()}_${f.name}`;
        const { error: upErr } = await supabase.storage.from('farm-images').upload(fileName, f);
        if (!upErr) banner_url = supabase.storage.from('farm-images').getPublicUrl(fileName).data.publicUrl;
    }

    const payload = {
        id: currentUser.id,
        farm_name,
        username,
        avatar_url,
        banner_url,
        location,
        farm_category: category,
        specialization,
        bio: bioText
    };

    let usernameSkippedForLegacySchema = false;
    let { error } = await supabase.from('profiles').upsert(payload);
    if (error) {
        usernameSkippedForLegacySchema = true;
        const fallbackPayload = {
            id: currentUser.id,
            farm_name,
            avatar_url,
            banner_url,
            location,
            bio: bioText
        };
        const fallbackResult = await supabase.from('profiles').upsert(fallbackPayload);
        error = fallbackResult.error;
    }

    if (error) {
        editProfileMsg.textContent = error.message || 'Failed to save';
        saveProfileBtn.disabled = false;
        return;
    }

    if (usernameSkippedForLegacySchema && username) {
        editProfileMsg.textContent = 'Profile saved. Username needs the latest Supabase schema migration.';
    }

    // update UI
    profileName.textContent = farm_name;
    farmHandle = username;
    if (profileHandle) profileHandle.textContent = farmHandle ? `@${farmHandle}` : "@yourusername";
    profileBio.textContent = bioText;
    profileLocation.textContent = location;
    farmCategory = category;
    farmSpecialization = specialization;
    refreshFarmTags();
    if (avatar_url) profileAvatar.src = avatar_url;
    if (banner_url) profileBanner.src = banner_url;

    editProfileMsg.textContent = 'Saved ✓';
    setTimeout(() => { editProfileModal.style.display = 'none'; editProfileMsg.textContent = ''; saveProfileBtn.disabled = false; }, 900);
}

function isPostVisible(post) {
    if (!post?.created_at) return true;

    const createdAt = new Date(post.created_at);
    if (Number.isNaN(createdAt.getTime())) return true;

    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    return expiresAt > new Date();
}

function validateImageFile(file) {
    return new Promise((resolve) => {
        if (!file) {
            resolve({ valid: false, message: "Please select an image" });
            return;
        }

        const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
        if (!allowedTypes.includes(file.type)) {
            resolve({ valid: false, message: "Please upload a JPG, PNG, or WebP image." });
            return;
        }

        if (file.size > 5 * 1024 * 1024) {
            resolve({ valid: false, message: "Please upload a high-quality image smaller than 5MB." });
            return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                if (img.width < 1200 || img.height < 900) {
                    resolve({ valid: false, message: "Please upload a high-quality photo at least 1200x900 pixels." });
                } else {
                    resolve({ valid: true });
                }
            };
            img.onerror = () => resolve({ valid: false, message: "The selected image could not be read." });
            img.src = event.target.result;
        };
        reader.onerror = () => resolve({ valid: false, message: "The selected image could not be loaded." });
        reader.readAsDataURL(file);
    });
}

async function uploadFromProfile() {
    if (!currentUser) {
        uploadProfileMsg.textContent = 'You must be signed in to post.';
        return;
    }

    uploadFromProfileBtn.disabled = true;
    uploadProfileMsg.textContent = 'Uploading...';

    const title = pTitle.value.trim();
    const amount = pAmount.value.trim();
    const unit_price = Number(pUnitPrice.value.trim());
    const price = Number(pTotalPrice.value.trim());
    const contact = pContact.value.trim();
    const file = pImage.files[0];

    if (!title || !amount || isNaN(unit_price) || isNaN(price) || !contact) {
        uploadProfileMsg.textContent = 'Please fill all fields.';
        uploadFromProfileBtn.disabled = false;
        return;
    }

    const validation = await validateImageFile(file);
    if (!validation.valid) {
        uploadProfileMsg.textContent = validation.message;
        uploadFromProfileBtn.disabled = false;
        return;
    }

    const fileName = `posts/${currentUser.id}_${Date.now()}_${file.name}`;
    const { error: imgError } = await supabase.storage.from('farm-images').upload(fileName, file);
    if (imgError) {
        uploadProfileMsg.textContent = imgError.message || 'Image upload failed';
        uploadFromProfileBtn.disabled = false;
        return;
    }

    const image_url = supabase.storage.from('farm-images').getPublicUrl(fileName).data.publicUrl;

    const { error } = await supabase.from('posts').insert([{
        title,
        farm: editFarmName.value || profileName.textContent || farmName,
        location: editLocation.value || profileLocation.textContent || farmLocation,
        amount,
        unit_price,
        price,
        contact,
        image_url,
        latitude: null,
        longitude: null
    }]);

    if (error) {
        uploadProfileMsg.textContent = error.message || 'Failed to post';
        uploadFromProfileBtn.disabled = false;
        return;
    }

    uploadProfileMsg.textContent = 'Posted ✓';
    setTimeout(() => { uploadProfileModal.style.display = 'none'; uploadProfileMsg.textContent = ''; uploadFromProfileBtn.disabled = false; loadProfilePosts(); }, 900);
}

initProfilePage();

profileBanner.src = bannerImage;
profileAvatar.src = avatarImage;
profileName.textContent = farmName;
profileBio.textContent = bio;
profileLocation.textContent = farmLocation;
refreshFarmTags();

followBtn.addEventListener("click", (event) => {
    event.preventDefault();
    toggleProfileFollow();
});

function setFollowButtonState(isFollowing) {
    if (!followBtn) return;
    followBtn.textContent = isFollowing ? "Following" : "Follow";
    followBtn.style.background = isFollowing ? "rgba(255,255,255,0.06)" : "";
    followBtn.style.color = isFollowing ? "#f8fafc" : "";
}

async function refreshFollowButtonState() {
    if (!followBtn || !currentUser || isOwnerProfile || !viewedProfileId) return;
    const { data } = await supabase
        .from('grow_follows')
        .select('id')
        .eq('follower_id', currentUser.id)
        .eq('followee_id', viewedProfileId)
        .maybeSingle();

    setFollowButtonState(Boolean(data));
}

async function toggleProfileFollow() {
    if (!followBtn || !currentUser || isOwnerProfile || !viewedProfileId) return;

    const isFollowing = followBtn.textContent === 'Following';
    if (isFollowing) {
        await supabase.from('grow_follows').delete().eq('follower_id', currentUser.id).eq('followee_id', viewedProfileId);
        setFollowButtonState(false);
        return;
    }

    const { error } = await supabase.from('grow_follows').insert([{
        follower_id: currentUser.id,
        followee_id: viewedProfileId
    }]);

    if (error && !String(error.message || '').toLowerCase().includes('duplicate')) {
        return;
    }

    setFollowButtonState(true);

    await supabase.from('grow_notifications').insert([{
        recipient_id: viewedProfileId,
        actor_id: currentUser.id,
        actor_name: currentUser.email,
        actor_avatar_url: null,
        video_id: null,
        comment_id: null,
        event_type: 'follow',
        message: `${currentUser.email} followed your farm on FreshLink Grow.`
    }]);
}

async function loadProfilePosts() {
    const matchField = farmName ? { farm: farmName } : { contact: farmerEmail };
    const { data, error } = await supabase
        .from("posts")
        .select("*")
        .match(matchField)
        .order("created_at", { ascending: false });

    if (error) {
        profilePosts.innerHTML = `<div class="empty-grid">Unable to load farm posts.</div>`;
        return;
    }

    const posts = (data || []).filter(isPostVisible);
    profilePostsCount.textContent = posts.length;

    if (!posts.length) {
        profilePosts.style.display = "none";
        emptyProfileMessage.style.display = "block";
        return;
    }

    profilePosts.style.display = "grid";
    emptyProfileMessage.style.display = "none";

    profilePosts.innerHTML = posts.map(post => `
        <div class="profile-card" onclick="window.location.href='product.html?title=${encodeURIComponent(post.title)}&image=${encodeURIComponent(post.image_url)}&price=${encodeURIComponent(post.price)}&amount=${encodeURIComponent(post.amount || '1 unit')}&unit_price=${encodeURIComponent(post.unit_price || post.price)}&location=${encodeURIComponent(post.location)}&contact=${encodeURIComponent(post.contact)}&email=${encodeURIComponent(post.email || farmerEmail)}&description=${encodeURIComponent(post.description || '')}&farm=${encodeURIComponent(post.farm)}&category=${encodeURIComponent(post.category || 'produce')}&video_url=${encodeURIComponent(post.video_url || '')}'">
            <img src="${post.image_url}" alt="${post.title}">
            <div class="profile-card-info">
                <div class="profile-card-title">${escapeHtml(post.title)}</div>
                <div class="profile-card-meta">${post.amount ? escapeHtml(post.amount) + ' • ' : ''}${post.price ? `R${Number(post.price).toFixed(2)}` : 'Price on request'}</div>
            </div>
        </div>
    `).join("");
}

async function loadGrowVideos() {
    if (!profileGrowVideos || !emptyGrowMessage) return;

    const creatorEmail = isOwnerProfile ? (currentUser?.email || farmerEmail) : farmerEmail;
    if (!creatorEmail) {
        profileGrowVideos.style.display = 'none';
        emptyGrowMessage.style.display = 'block';
        if (profileGrowCount) profileGrowCount.textContent = '0';
        return;
    }

    const { data, error } = await supabase
        .from('grow_videos')
        .select('id, caption, thumbnail_url, category, created_at, view_count')
        .eq('creator_email', creatorEmail)
        .order('created_at', { ascending: false });

    if (error) {
        profileGrowVideos.style.display = 'none';
        emptyGrowMessage.style.display = 'block';
        emptyGrowMessage.textContent = 'Unable to load FreshLink Grow videos.';
        if (profileGrowCount) profileGrowCount.textContent = '0';
        return;
    }

    const videos = Array.isArray(data) ? data : [];
    if (profileGrowCount) profileGrowCount.textContent = String(videos.length);

    if (!videos.length) {
        profileGrowVideos.style.display = 'none';
        emptyGrowMessage.style.display = 'block';
        emptyGrowMessage.textContent = 'No FreshLink Grow videos posted yet.';
        return;
    }

    profileGrowVideos.style.display = 'grid';
    emptyGrowMessage.style.display = 'none';
    profileGrowVideos.innerHTML = videos.map((video) => `
        <div class="grow-profile-card" onclick="window.location.href='grow.html?video=${video.id}'">
            <img src="${escapeHtml(video.thumbnail_url || '')}" alt="${escapeHtml(video.caption || 'Grow video')}">
            <div class="grow-profile-overlay">
                <strong>${escapeHtml((video.caption || 'Grow video').substring(0, 80))}</strong>
                <span>${escapeHtml(video.category || 'grow')} • ${Number(video.view_count || 0)} views</span>
            </div>
        </div>
    `).join('');
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}
