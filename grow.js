import { supabase } from "./supabase.js";

const GROW_CACHE_KEY = "freshlink_grow_cache_v1";
const GROW_CATEGORIES = [
    { key: "all", label: "All topics" },
    { key: "crops", label: "Crops" },
    { key: "livestock", label: "Livestock" },
    { key: "machinery", label: "Machinery" },
    { key: "irrigation", label: "Irrigation" },
    { key: "harvesting", label: "Harvesting" },
    { key: "education", label: "Education" },
    { key: "sustainability", label: "Sustainability" },
    { key: "business", label: "Business" },
    { key: "services", label: "Services" }
];

const feedElement = document.getElementById("growFeed");
const searchInput = document.getElementById("growSearchInput");
const categoryRail = document.getElementById("growCategoryRail");
const statusBox = document.getElementById("growStatus");
const offlineBanner = document.getElementById("growOffline");
const notificationsList = document.getElementById("growNotificationsList");
const unreadBadge = document.getElementById("growUnreadBadge");
const notificationsBtn = document.getElementById("growNotificationsBtn");
const markReadBtn = document.getElementById("growMarkReadBtn");
const savedBtn = document.getElementById("growSavedBtn");
const followingBtn = document.getElementById("growFollowingBtn");
const moderationBtn = document.getElementById("growModerationBtn");
const moderationPanel = document.getElementById("growModerationPanel");
const moderationList = document.getElementById("growModerationList");
const uploadShortcut = document.getElementById("growUploadShortcut");
const heroUpload = document.getElementById("growHeroUpload");

const commentsModal = document.getElementById("growCommentsModal");
const commentsTitle = document.getElementById("growCommentsTitle");
const commentsList = document.getElementById("growCommentsList");
const commentInput = document.getElementById("growCommentInput");
const sendCommentBtn = document.getElementById("growSendComment");
const closeCommentsBtn = document.getElementById("growCloseComments");

const reportModal = document.getElementById("growReportModal");
const reportReason = document.getElementById("growReportReason");
const reportDetails = document.getElementById("growReportDetails");
const submitReportBtn = document.getElementById("growSubmitReport");
const closeReportBtn = document.getElementById("growCloseReport");

const state = {
    currentUser: null,
    currentProfile: null,
    isAdmin: false,
    videos: [],
    attachments: new Map(),
    likes: [],
    saves: [],
    comments: [],
    follows: [],
    notifications: [],
    reports: [],
    creatorPreviewCache: new Map(),
    category: "all",
    query: "",
    viewMode: "all",
    activeVideoId: null,
    reportVideoId: null,
    viewedVideoIds: new Set(),
    observer: null,
    debounceTimer: null
};

function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
}

function formatCount(value) {
    const count = Number(value || 0);
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return String(count);
}

function formatTime(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Now";

    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    if (diffMinutes < 1) return "Now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString([], { month: "short", day: "numeric" });
}

function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
}

function firstLetter(value) {
    return String(value || "F").trim().charAt(0).toUpperCase() || "F";
}

function parseCachedState() {
    try {
        return JSON.parse(localStorage.getItem(GROW_CACHE_KEY) || "null");
    } catch {
        return null;
    }
}

function writeCachedState() {
    const payload = {
        videos: state.videos,
        likes: state.likes,
        saves: state.saves,
        comments: state.comments,
        follows: state.follows,
        notifications: state.notifications,
        reports: state.reports,
        attachments: Array.from(state.attachments.entries())
    };
    localStorage.setItem(GROW_CACHE_KEY, JSON.stringify(payload));
}

function restoreCachedState() {
    const cached = parseCachedState();
    if (!cached) return false;

    state.videos = Array.isArray(cached.videos) ? cached.videos : [];
    state.likes = Array.isArray(cached.likes) ? cached.likes : [];
    state.saves = Array.isArray(cached.saves) ? cached.saves : [];
    state.comments = Array.isArray(cached.comments) ? cached.comments : [];
    state.follows = Array.isArray(cached.follows) ? cached.follows : [];
    state.notifications = Array.isArray(cached.notifications) ? cached.notifications : [];
    state.reports = Array.isArray(cached.reports) ? cached.reports : [];
    state.attachments = new Map(Array.isArray(cached.attachments) ? cached.attachments : []);
    return state.videos.length > 0;
}

function showStatus(message, tone = "success") {
    if (!statusBox) return;
    statusBox.style.display = message ? "block" : "none";
    statusBox.className = tone === "error" ? "grow-status grow-pill-alert" : "grow-status";
    statusBox.textContent = message;
}

function clearStatus() {
    showStatus("");
}

function toggleOfflineState() {
    if (!offlineBanner) return;
    offlineBanner.style.display = navigator.onLine ? "none" : "block";
}

function renderCategoryRail() {
    if (!categoryRail) return;
    categoryRail.innerHTML = GROW_CATEGORIES.map((category) => `
        <button class="grow-chip ${state.category === category.key ? "active" : ""}" data-category="${escapeHtml(category.key)}">${escapeHtml(category.label)}</button>
    `).join("");
}

function getFilteredVideos() {
    const query = state.query.trim().toLowerCase();
    let videos = [...state.videos];

    if (state.category !== "all") {
        videos = videos.filter((video) => String(video.category || "").toLowerCase() === state.category);
    }

    if (state.viewMode === "saved") {
        const savedIds = new Set(state.saves.filter((item) => item.user_id === state.currentUser?.id).map((item) => Number(item.video_id)));
        videos = videos.filter((video) => savedIds.has(Number(video.id)));
    }

    if (state.viewMode === "following") {
        const followedIds = new Set(state.follows.filter((item) => item.follower_id === state.currentUser?.id).map((item) => item.followee_id));
        videos = videos.filter((video) => followedIds.has(video.creator_id));
    }

    if (!query) return videos;

    return videos.filter((video) => {
        const haystack = [
            video.caption,
            video.category,
            video.location_text,
            video.creator_name,
            video.attached_title,
            ...(Array.isArray(video.hashtags) ? video.hashtags : [])
        ].join(" ").toLowerCase();
        return haystack.includes(query);
    });
}

function isLiked(videoId) {
    return state.likes.some((item) => Number(item.video_id) === Number(videoId) && item.user_id === state.currentUser?.id);
}

function isSaved(videoId) {
    return state.saves.some((item) => Number(item.video_id) === Number(videoId) && item.user_id === state.currentUser?.id);
}

function isFollowing(creatorId) {
    return state.follows.some((item) => item.followee_id === creatorId && item.follower_id === state.currentUser?.id);
}

function getFollowerCount(creatorId) {
    return state.follows.filter((item) => item.followee_id === creatorId).length;
}

function getComments(videoId) {
    return state.comments
        .filter((item) => Number(item.video_id) === Number(videoId))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function getAttachment(videoId) {
    const video = state.videos.find((item) => Number(item.id) === Number(videoId));
    if (!video?.attached_post_id) return null;
    return state.attachments.get(String(video.attached_post_id)) || null;
}

function getCategoryLabel(categoryKey) {
    return GROW_CATEGORIES.find((item) => item.key === categoryKey)?.label || categoryKey;
}

function creatorProfileUrl(video) {
    const creatorName = video.creator_name || video.creator_email || "FreshLink Grow Creator";
    return `profile.html?farm=${encodeURIComponent(creatorName)}&email=${encodeURIComponent(video.creator_email || "")}&avatar=${encodeURIComponent(video.creator_avatar_url || "")}`;
}

function productUrlFromPost(post) {
    if (!post) return "feed.html";
    return `product.html?title=${encodeURIComponent(post.title || "Marketplace listing")}&image=${encodeURIComponent(post.image_url || "")}&price=${encodeURIComponent(post.price || 0)}&amount=${encodeURIComponent(post.amount || "1 unit")}&unit_price=${encodeURIComponent(post.unit_price || post.price || 0)}&location=${encodeURIComponent(post.location || "")}&contact=${encodeURIComponent(post.contact || "")}&email=${encodeURIComponent(post.owner_email || post.email || "")}&description=${encodeURIComponent(post.description || "")}&farm=${encodeURIComponent(post.farm || post.owner_email || "Seller")}&category=${encodeURIComponent(post.category || "produce")}&video_url=${encodeURIComponent(post.video_url || "")}`;
}

function renderNotifications() {
    if (!notificationsList) return;
    const notifications = [...state.notifications].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    const unread = notifications.filter((item) => !item.read_at).length;

    if (unreadBadge) {
        unreadBadge.style.display = unread ? "inline" : "none";
        unreadBadge.textContent = String(unread);
    }

    if (!notifications.length) {
        notificationsList.innerHTML = '<div class="grow-panel-item"><strong>No alerts yet</strong><small>Your likes, comments, follows, and moderation updates will appear here.</small></div>';
        return;
    }

    notificationsList.innerHTML = notifications.map((item) => `
        <div class="grow-panel-item" style="${item.read_at ? "" : "border-color: rgba(34, 197, 94, 0.28);"}">
            <strong>${escapeHtml(item.actor_name || "FreshLink Grow")}</strong>
            <div class="grow-muted">${escapeHtml(item.message || "Activity update")}</div>
            <small>${escapeHtml(item.event_type || "update")} • ${formatTime(item.created_at)}</small>
        </div>
    `).join("");
}

function renderModerationPanel() {
    if (!moderationPanel || !moderationList) return;
    moderationPanel.style.display = state.isAdmin ? "block" : "none";
    if (moderationBtn) moderationBtn.style.display = state.isAdmin ? "inline-flex" : "none";

    if (!state.isAdmin) return;

    if (!state.reports.length) {
        moderationList.innerHTML = '<div class="grow-panel-item"><strong>No open reports</strong><small>FreshLink Grow moderation queue is clear.</small></div>';
        return;
    }

    moderationList.innerHTML = state.reports.map((report) => {
        const video = state.videos.find((item) => Number(item.id) === Number(report.video_id));
        return `
            <div class="grow-moderation-card">
                <strong>${escapeHtml(report.reason)}</strong>
                <div class="grow-muted">${escapeHtml(video?.creator_name || "Creator")} • ${escapeHtml(video?.caption || "Video")}</div>
                <small>${formatTime(report.created_at)} • ${escapeHtml(report.status)}</small>
                <div class="grow-action-row" style="margin-top:10px;">
                    <button class="secondary-btn inline-action grow-inline-btn" data-action="moderation-review" data-report-id="${report.id}" data-video-id="${report.video_id}">Review</button>
                    <button class="danger-btn inline-action grow-inline-btn" data-action="moderation-hide" data-report-id="${report.id}" data-video-id="${report.video_id}">Hide video</button>
                    <button class="secondary-btn inline-action grow-inline-btn" data-action="moderation-dismiss" data-report-id="${report.id}" data-video-id="${report.video_id}">Dismiss</button>
                </div>
            </div>
        `;
    }).join("");
}

function renderFeed() {
    if (!feedElement) return;
    const videos = getFilteredVideos();

    if (!state.videos.length) {
        feedElement.innerHTML = `
            <div class="grow-empty">
                <h3>No Grow videos yet</h3>
                <p>Be the first to share an agriculture video and connect it to your FreshLink marketplace listing.</p>
                <button class="primary-btn inline-action" onclick="window.location.href='grow-upload.html'">Upload the first Grow video</button>
            </div>
        `;
        return;
    }

    if (!videos.length) {
        feedElement.innerHTML = `
            <div class="grow-empty">
                <h3>No results match your filter</h3>
                <p>Try another farming keyword, remove the filter, or switch back to the full Grow feed.</p>
            </div>
        `;
        return;
    }

    feedElement.innerHTML = videos.map((video) => {
        const attachedPost = getAttachment(video.id);
        const comments = getComments(video.id);
        const hashtags = Array.isArray(video.hashtags) ? video.hashtags : [];
        const liked = isLiked(video.id);
        const saved = isSaved(video.id);
        const following = isFollowing(video.creator_id);
        const followers = getFollowerCount(video.creator_id);
        const creatorName = video.creator_name || video.creator_email || "FreshLink Grow Creator";
        const title = video.caption || "FreshLink Grow update";
        const locationText = video.location_text ? `<div class="grow-muted">${escapeHtml(video.location_text)}</div>` : "";
        const attachmentBlock = attachedPost ? `
            <div class="grow-attachment">
                <div class="grow-attach-pill">Marketplace attached</div>
                <div class="grow-attachment-title">${escapeHtml(attachedPost.title || video.attached_title || "Marketplace listing")}</div>
                <div class="grow-attachment-copy">${escapeHtml(attachedPost.description || "This Grow video links directly to an active FreshLink marketplace listing.")}</div>
                <div class="grow-attachment-actions">
                    <button class="primary-btn inline-action grow-inline-btn" data-action="open-listing" data-video-id="${video.id}">Open listing</button>
                    <button class="secondary-btn inline-action grow-inline-btn" data-action="contact-seller" data-video-id="${video.id}">Contact seller</button>
                </div>
            </div>
        ` : "";

        const avatarMarkup = video.creator_avatar_url
            ? `<img src="${escapeHtml(video.creator_avatar_url)}" alt="${escapeHtml(creatorName)}">`
            : `<div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; color:#f8fafc; font-weight:800; font-size:18px;">${escapeHtml(firstLetter(creatorName))}</div>`;

        return `
            <article class="grow-feed-card" id="grow-card-${video.id}">
                <div class="grow-media">
                    <video class="grow-video-player" data-video-id="${video.id}" data-src="${escapeHtml(video.video_url)}" poster="${escapeHtml(video.thumbnail_url || "")}" muted loop playsinline preload="metadata"></video>
                    <div class="grow-media-overlay">
                        <div class="grow-media-top">
                            <span class="grow-category-pill">${escapeHtml(getCategoryLabel(video.category))}</span>
                            <span class="grow-stat-pill">${formatCount(video.view_count)} views</span>
                        </div>
                        <div class="grow-media-bottom">
                            <span class="grow-stat-pill">${Math.max(1, Number(video.duration_seconds || 0))}s</span>
                            ${attachedPost ? '<span class="grow-attach-pill">Linked to marketplace</span>' : ''}
                            <button class="grow-sound-btn" type="button" data-action="sound" data-video-id="${video.id}" aria-pressed="false">🔇 Sound off</button>
                        </div>
                    </div>
                </div>
                <div class="grow-card-body">
                    <div class="grow-creator-row">
                        <a class="grow-creator-avatar" href="${creatorProfileUrl(video)}">${avatarMarkup}</a>
                        <div class="grow-creator-meta">
                            <div class="grow-creator-name">${escapeHtml(creatorName)}</div>
                            <div class="grow-creator-subline">${followers} followers • ${formatTime(video.created_at)}</div>
                        </div>
                        <button class="secondary-btn inline-action grow-inline-btn" data-action="open-profile" data-video-id="${video.id}">Profile</button>
                        ${video.creator_id === state.currentUser?.id ? "" : `<button class="${following ? "secondary-btn" : "primary-btn"} inline-action grow-inline-btn" data-action="follow" data-creator-id="${video.creator_id}" data-video-id="${video.id}">${following ? "Following" : "Follow"}</button>`}
                    </div>

                    <p class="grow-title">${escapeHtml(title)}</p>
                    ${locationText}

                    <div class="grow-hashtags">${hashtags.map((tag) => `<span class="grow-tag">${escapeHtml(tag)}</span>`).join("")}</div>

                    <div class="grow-meta-grid">
                        <div class="grow-metric"><div class="grow-metric-label">Likes</div><div class="grow-metric-value">${formatCount(video.like_count)}</div></div>
                        <div class="grow-metric"><div class="grow-metric-label">Comments</div><div class="grow-metric-value">${formatCount(video.comment_count)}</div></div>
                        <div class="grow-metric"><div class="grow-metric-label">Shares</div><div class="grow-metric-value">${formatCount(video.share_count)}</div></div>
                    </div>

                    ${attachmentBlock}

                    <div class="grow-action-row">
                        <button class="${liked ? "primary-btn" : "secondary-btn"} inline-action grow-inline-btn grow-count-btn grow-like-btn" data-action="like" data-video-id="${video.id}" aria-pressed="${liked}">${liked ? "Liked" : "Like"} <span>${formatCount(video.like_count)}</span></button>
                        <button class="secondary-btn inline-action grow-inline-btn grow-count-btn" data-action="comments" data-video-id="${video.id}">Read comments <span>${formatCount(comments.length)}</span></button>
                        <button class="${saved ? "primary-btn" : "secondary-btn"} inline-action grow-inline-btn grow-count-btn" data-action="save" data-video-id="${video.id}">Save <span>${formatCount(video.save_count)}</span></button>
                        <button class="secondary-btn inline-action grow-inline-btn" data-action="share" data-video-id="${video.id}">Share</button>
                        <button class="secondary-btn inline-action grow-inline-btn" data-action="download" data-video-id="${video.id}">Download</button>
                        <button class="secondary-btn inline-action grow-inline-btn" data-action="report" data-video-id="${video.id}">Report</button>
                    </div>
                </div>
            </article>
        `;
    }).join("");

    setupVideoObserver();
}

function renderCommentsModal(videoId) {
    const video = state.videos.find((item) => Number(item.id) === Number(videoId));
    const comments = getComments(videoId);
    if (commentsTitle) {
        commentsTitle.textContent = `Comments • ${video?.creator_name || "FreshLink Grow"}`;
    }

    if (!commentsList) return;
    if (!comments.length) {
        commentsList.innerHTML = '<div class="grow-comment-item"><strong>No comments yet</strong><div class="grow-muted">Start the farming discussion with a useful question or insight.</div></div>';
        return;
    }

    commentsList.innerHTML = comments.map((comment) => `
        <div class="grow-comment-item">
            <strong>${escapeHtml(comment.user_name || comment.user_email || "FreshLink user")}</strong>
            <div style="margin-top:6px; color:var(--text); line-height:1.6;">${escapeHtml(comment.content)}</div>
            <small>${formatTime(comment.created_at)}</small>
        </div>
    `).join("");
}

function openComments(videoId) {
    state.activeVideoId = Number(videoId);
    renderCommentsModal(videoId);
    if (commentsModal) commentsModal.style.display = "flex";
}

function closeComments() {
    if (commentsModal) commentsModal.style.display = "none";
    if (commentInput) commentInput.value = "";
}

function openReport(videoId) {
    state.reportVideoId = Number(videoId);
    if (reportModal) reportModal.style.display = "flex";
}

function closeReport() {
    if (reportModal) reportModal.style.display = "none";
    state.reportVideoId = null;
    if (reportDetails) reportDetails.value = "";
}

async function getCurrentUserAndProfile() {
    const { data } = await supabase.auth.getSession();
    state.currentUser = data?.session?.user || null;
    if (!state.currentUser) {
        window.location.href = "index.html";
        return false;
    }

    const { data: profile } = await supabase
        .from("profiles")
        .select("farm_name, avatar_url, banner_url, location, bio, role")
        .eq("id", state.currentUser.id)
        .maybeSingle();

    state.currentProfile = profile || null;
    state.isAdmin = String(profile?.role || "").toLowerCase() === "admin";
    return true;
}

async function fetchGrowData() {
    const videosPromise = supabase.from("grow_videos").select("*").order("created_at", { ascending: false }).limit(80);
    const likesPromise = supabase.from("grow_video_likes").select("video_id,user_id");
    const savesPromise = supabase.from("grow_video_saves").select("video_id,user_id");
    const commentsPromise = supabase.from("grow_video_comments").select("id,video_id,user_id,user_email,user_name,user_avatar_url,content,created_at").order("created_at", { ascending: true });
    const followsPromise = supabase.from("grow_follows").select("follower_id,followee_id");
    const notificationsPromise = supabase.from("grow_notifications").select("*").eq("recipient_id", state.currentUser.id).order("created_at", { ascending: false }).limit(40);
    const reportsPromise = state.isAdmin
        ? supabase.from("grow_reports").select("*").in("status", ["open", "reviewing"]).order("created_at", { ascending: false }).limit(40)
        : Promise.resolve({ data: [], error: null });

    const [videosRes, likesRes, savesRes, commentsRes, followsRes, notificationsRes, reportsRes] = await Promise.all([
        videosPromise,
        likesPromise,
        savesPromise,
        commentsPromise,
        followsPromise,
        notificationsPromise,
        reportsPromise
    ]);

    if (videosRes.error) {
        throw new Error(videosRes.error.message || "Unable to load Grow videos.");
    }

    state.videos = Array.isArray(videosRes.data) ? videosRes.data : [];
    state.likes = Array.isArray(likesRes.data) ? likesRes.data : [];
    state.saves = Array.isArray(savesRes.data) ? savesRes.data : [];
    state.comments = Array.isArray(commentsRes.data) ? commentsRes.data : [];
    state.follows = Array.isArray(followsRes.data) ? followsRes.data : [];
    state.notifications = Array.isArray(notificationsRes.data) ? notificationsRes.data : [];
    state.reports = Array.isArray(reportsRes.data) ? reportsRes.data : [];

    const attachedIds = Array.from(new Set(state.videos.map((item) => item.attached_post_id).filter(Boolean)));
    state.attachments = new Map();
    if (attachedIds.length) {
        const { data: postsData } = await supabase.from("posts").select("*").in("id", attachedIds);
        (postsData || []).forEach((post) => {
            state.attachments.set(String(post.id), post);
        });
    }

    writeCachedState();
}

async function loadGrowData({ showLoading = true } = {}) {
    if (showLoading && feedElement) {
        feedElement.innerHTML = '<div class="grow-loading">Loading FreshLink Grow videos, creators, comments, and marketplace links...</div>';
    }

    try {
        await fetchGrowData();
        renderFeed();
        renderNotifications();
        renderModerationPanel();
        clearStatus();

        const uploaded = new URLSearchParams(window.location.search).get("uploaded");
        if (uploaded) {
            showStatus("Your FreshLink Grow video is live and connected to the feed.");
        }

        focusTargetVideoFromUrl();
    } catch (error) {
        if (restoreCachedState()) {
            renderFeed();
            renderNotifications();
            renderModerationPanel();
            showStatus(`${error.message} Showing the most recent cached Grow data.`, "error");
        } else if (feedElement) {
            feedElement.innerHTML = `<div class="grow-error">${escapeHtml(error.message || "Unable to load FreshLink Grow.")}</div>`;
        }
    }
}

function focusTargetVideoFromUrl() {
    const targetId = Number(new URLSearchParams(window.location.search).get("video"));
    if (!Number.isFinite(targetId)) return;
    const card = document.getElementById(`grow-card-${targetId}`);
    if (!card) return;
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.style.outline = "2px solid rgba(34, 197, 94, 0.35)";
    window.setTimeout(() => {
        card.style.outline = "";
    }, 1800);
}

async function adjustMetric(videoId, metric, delta) {
    await supabase.rpc("adjust_grow_video_metric", {
        _video_id: Number(videoId),
        _metric: metric,
        _delta: Number(delta)
    });

    const video = state.videos.find((item) => Number(item.id) === Number(videoId));
    if (!video) return;
    const current = Number(video[metric] || 0);
    video[metric] = Math.max(0, current + Number(delta || 0));
}

async function sendNotification(recipientId, eventType, message, videoId = null, commentId = null) {
    if (!recipientId || recipientId === state.currentUser?.id) return;

    await supabase.from("grow_notifications").insert([{
        recipient_id: recipientId,
        actor_id: state.currentUser.id,
        actor_name: state.currentProfile?.farm_name || state.currentUser.email,
        actor_avatar_url: state.currentProfile?.avatar_url || null,
        video_id: videoId,
        comment_id: commentId,
        event_type: eventType,
        message
    }]);
}

async function toggleLike(videoId) {
    const liked = isLiked(videoId);
    const video = state.videos.find((item) => Number(item.id) === Number(videoId));
    if (!video) return;

    if (liked) {
        await supabase.from("grow_video_likes").delete().eq("video_id", videoId).eq("user_id", state.currentUser.id);
        state.likes = state.likes.filter((item) => !(Number(item.video_id) === Number(videoId) && item.user_id === state.currentUser.id));
        await adjustMetric(videoId, "like_count", -1);
    } else {
        const { error } = await supabase.from("grow_video_likes").insert([{ video_id: videoId, user_id: state.currentUser.id }]);
        if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
            showStatus(error.message || "Unable to like video.", "error");
            return;
        }
        state.likes.push({ video_id: Number(videoId), user_id: state.currentUser.id });
        await adjustMetric(videoId, "like_count", 1);
        await sendNotification(video.creator_id, "like", `${state.currentProfile?.farm_name || state.currentUser.email} liked your Grow video.`, videoId);
    }

    renderFeed();
    renderNotifications();
}

async function toggleSave(videoId) {
    const saved = isSaved(videoId);
    if (saved) {
        await supabase.from("grow_video_saves").delete().eq("video_id", videoId).eq("user_id", state.currentUser.id);
        state.saves = state.saves.filter((item) => !(Number(item.video_id) === Number(videoId) && item.user_id === state.currentUser.id));
        await adjustMetric(videoId, "save_count", -1);
    } else {
        const { error } = await supabase.from("grow_video_saves").insert([{ video_id: videoId, user_id: state.currentUser.id }]);
        if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
            showStatus(error.message || "Unable to save video.", "error");
            return;
        }
        state.saves.push({ video_id: Number(videoId), user_id: state.currentUser.id });
        await adjustMetric(videoId, "save_count", 1);
    }

    renderFeed();
}

async function toggleFollow(creatorId, videoId) {
    if (!creatorId || creatorId === state.currentUser?.id) return;
    const following = isFollowing(creatorId);
    const video = state.videos.find((item) => Number(item.id) === Number(videoId));

    if (following) {
        await supabase.from("grow_follows").delete().eq("follower_id", state.currentUser.id).eq("followee_id", creatorId);
        state.follows = state.follows.filter((item) => !(item.follower_id === state.currentUser.id && item.followee_id === creatorId));
    } else {
        const { error } = await supabase.from("grow_follows").insert([{ follower_id: state.currentUser.id, followee_id: creatorId }]);
        if (error && !String(error.message || "").toLowerCase().includes("duplicate")) {
            showStatus(error.message || "Unable to follow creator.", "error");
            return;
        }
        state.follows.push({ follower_id: state.currentUser.id, followee_id: creatorId });
        await sendNotification(creatorId, "follow", `${state.currentProfile?.farm_name || state.currentUser.email} followed your farm on Grow.`);
    }

    renderFeed();
    renderNotifications();
    renderModerationPanel();
}

async function shareVideo(videoId) {
    const url = new URL(window.location.href);
    url.searchParams.set("video", String(videoId));
    url.searchParams.delete("uploaded");

    const shareUrl = url.toString();
    if (navigator.share) {
        try {
            await navigator.share({ title: "FreshLink Grow", text: "Watch this farming video on FreshLink Grow.", url: shareUrl });
        } catch {
            // User cancelled share dialog.
        }
    } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        showStatus("Grow video link copied to clipboard.");
    }

    await adjustMetric(videoId, "share_count", 1);
    renderFeed();
}

async function downloadVideo(videoId) {
    const video = document.querySelector(`.grow-video-player[data-video-id="${videoId}"]`);
    const sourceUrl = video?.currentSrc || video?.src || video?.getAttribute("data-src");
    if (!sourceUrl) {
        showStatus("This video is not ready to download yet.", "error");
        return;
    }

    try {
        const response = await fetch(sourceUrl, { mode: "cors" });
        if (!response.ok) throw new Error("Download request failed.");

        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = `freshlink-grow-${videoId}.mp4`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        showStatus("Download started. Check your phone's Downloads or Files app.");
    } catch {
        const link = document.createElement("a");
        link.href = sourceUrl;
        link.download = `freshlink-grow-${videoId}.mp4`;
        link.target = "_blank";
        link.rel = "noopener";
        document.body.appendChild(link);
        link.click();
        link.remove();
        showStatus("The video opened for saving. Use Share, then Save Video on your phone.");
    }
}

async function submitComment() {
    const content = String(commentInput?.value || "").trim();
    if (!content || !state.activeVideoId) return;

    const video = state.videos.find((item) => Number(item.id) === Number(state.activeVideoId));
    if (!video) return;

    const payload = {
        video_id: state.activeVideoId,
        user_id: state.currentUser.id,
        user_email: state.currentUser.email,
        user_name: state.currentProfile?.farm_name || state.currentUser.email,
        user_avatar_url: state.currentProfile?.avatar_url || null,
        content
    };

    const { data, error } = await supabase.from("grow_video_comments").insert([payload]).select().single();
    if (error) {
        showStatus(error.message || "Unable to comment on video.", "error");
        return;
    }

    state.comments.push(data);
    await adjustMetric(state.activeVideoId, "comment_count", 1);
    commentInput.value = "";
    renderCommentsModal(state.activeVideoId);
    renderFeed();

    await sendNotification(video.creator_id, "comment", `${payload.user_name} commented on your Grow video.`, state.activeVideoId, data.id);
}

async function submitReport() {
    const reason = String(reportReason?.value || "").trim();
    const details = String(reportDetails?.value || "").trim();
    if (!state.reportVideoId || !reason) return;

    const { error } = await supabase.from("grow_reports").insert([{
        reporter_id: state.currentUser.id,
        video_id: state.reportVideoId,
        reason,
        details,
        status: "open"
    }]);

    if (error) {
        showStatus(error.message || "Unable to submit report.", "error");
        return;
    }

    showStatus("Report submitted. FreshLink Grow moderation will review the video.");
    closeReport();
    await loadGrowData({ showLoading: false });
}

async function markNotificationsRead() {
    const unreadIds = state.notifications.filter((item) => !item.read_at).map((item) => item.id);
    if (!unreadIds.length) return;

    await supabase.from("grow_notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    state.notifications = state.notifications.map((item) => unreadIds.includes(item.id) ? { ...item, read_at: new Date().toISOString() } : item);
    renderNotifications();
}

async function moderateReport(reportId, videoId, action) {
    const report = state.reports.find((item) => Number(item.id) === Number(reportId));
    const video = state.videos.find((item) => Number(item.id) === Number(videoId));
    if (!report || !video) return;

    if (action === "hide") {
        await supabase.from("grow_videos").update({ moderation_status: "hidden" }).eq("id", videoId);
        await supabase.from("grow_reports").update({ status: "resolved", reviewed_by: state.currentUser.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
        await sendNotification(video.creator_id, "video_hidden", "One of your Grow videos was hidden after moderation review.", videoId);
    } else if (action === "dismiss") {
        await supabase.from("grow_reports").update({ status: "dismissed", reviewed_by: state.currentUser.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
    } else {
        await supabase.from("grow_reports").update({ status: "reviewing", reviewed_by: state.currentUser.id, reviewed_at: new Date().toISOString() }).eq("id", reportId);
    }

    await loadGrowData({ showLoading: false });
}

async function openCreatorProfile(videoId) {
    const video = state.videos.find((item) => Number(item.id) === Number(videoId));
    if (!video) return;

    let preview = null;
    if (video.creator_email) {
        const cached = state.creatorPreviewCache.get(video.creator_email);
        if (cached) {
            preview = cached;
        } else {
            const { data } = await supabase.rpc("get_profile_preview", { _email: video.creator_email });
            preview = Array.isArray(data) ? data[0] : data;
            if (preview) state.creatorPreviewCache.set(video.creator_email, preview);
        }
    }

    const url = new URL("profile.html", window.location.href);
    url.searchParams.set("farm", preview?.farm_name || video.creator_name || "FreshLink Grow Creator");
    url.searchParams.set("email", preview?.email || video.creator_email || "");
    url.searchParams.set("avatar", preview?.avatar_url || video.creator_avatar_url || "");
    url.searchParams.set("banner", preview?.banner_url || "");
    url.searchParams.set("location", preview?.location || video.location_text || "");
    url.searchParams.set("bio", preview?.bio || "FreshLink Grow creator on the FreshLink marketplace.");
    url.searchParams.set("farm_category", preview?.farm_category || "");
    url.searchParams.set("specialization", preview?.specialization || "");
    window.location.href = url.toString();
}

function openAttachedListing(videoId) {
    const post = getAttachment(videoId);
    if (!post) {
        showStatus("This Grow video does not have a marketplace listing attached.", "error");
        return;
    }
    window.location.href = productUrlFromPost(post);
}

function contactSeller(videoId) {
    const post = getAttachment(videoId);
    const video = state.videos.find((item) => Number(item.id) === Number(videoId));
    const sellerEmail = normalizeEmail(post?.owner_email || video?.creator_email);
    if (!sellerEmail) {
        showStatus("Seller contact is not available for this video.", "error");
        return;
    }
    const intent = new URLSearchParams({
        seller: sellerEmail,
        farm: post?.farm || video?.creator_name || "Seller",
        product: post?.title || "Grow listing",
        action: "chat",
        intent_id: String(Date.now())
    });
    window.location.href = `chat.html?${intent.toString()}`;
}

function setupVideoObserver() {
    if (state.observer) {
        state.observer.disconnect();
    }

    const videos = Array.from(document.querySelectorAll(".grow-video-player"));
    state.observer = new IntersectionObserver(async (entries) => {
        for (const entry of entries) {
            const video = entry.target;
            const videoId = Number(video.getAttribute("data-video-id"));
            if (!video.src) {
                video.src = video.getAttribute("data-src") || "";
            }

            if (entry.isIntersecting && entry.intersectionRatio >= 0.6) {
                try {
                    await video.play();
                } catch {
                    // Autoplay may be blocked; keep silent.
                }

                if (!state.viewedVideoIds.has(videoId)) {
                    state.viewedVideoIds.add(videoId);
                    await adjustMetric(videoId, "view_count", 1);
                }
            } else {
                video.pause();
            }
        }
    }, { threshold: [0.2, 0.6, 0.85] });

    videos.forEach((video) => state.observer.observe(video));
}

function toggleVideoSound(videoId, button) {
    const video = document.querySelector(`.grow-video-player[data-video-id="${videoId}"]`);
    if (!video) return;

    video.muted = !video.muted;
    video.volume = video.muted ? 0 : 1;
    button.setAttribute("aria-pressed", String(!video.muted));
    button.textContent = video.muted ? "🔇 Sound off" : "🔊 Sound on";

    if (!video.paused) return;
    video.play().catch(() => {
        button.setAttribute("aria-pressed", "false");
        video.muted = true;
        video.volume = 0;
        button.textContent = "🔇 Sound off";
    });
}

function bindStaticEvents() {
    renderCategoryRail();
    toggleOfflineState();

    searchInput?.addEventListener("input", (event) => {
        state.query = String(event.target.value || "");
        renderFeed();
    });

    categoryRail?.addEventListener("click", (event) => {
        const button = event.target.closest("[data-category]");
        if (!button) return;
        state.category = button.getAttribute("data-category") || "all";
        renderCategoryRail();
        renderFeed();
    });

    feedElement?.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const action = button.getAttribute("data-action");
        const videoId = Number(button.getAttribute("data-video-id"));
        const creatorId = button.getAttribute("data-creator-id");

        if (action === "sound") toggleVideoSound(videoId, button);
        if (action === "like") await toggleLike(videoId);
        if (action === "save") await toggleSave(videoId);
        if (action === "comments") openComments(videoId);
        if (action === "share") await shareVideo(videoId);
        if (action === "download") await downloadVideo(videoId);
        if (action === "follow") await toggleFollow(creatorId, videoId);
        if (action === "report") openReport(videoId);
        if (action === "open-listing") openAttachedListing(videoId);
        if (action === "contact-seller") contactSeller(videoId);
        if (action === "open-profile") await openCreatorProfile(videoId);
    });

    notificationsBtn?.addEventListener("click", () => {
        document.querySelector(".grow-drawer")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    markReadBtn?.addEventListener("click", markNotificationsRead);

    savedBtn?.addEventListener("click", () => {
        state.viewMode = state.viewMode === "saved" ? "all" : "saved";
        savedBtn.classList.toggle("primary-btn", state.viewMode === "saved");
        savedBtn.classList.toggle("secondary-btn", state.viewMode !== "saved");
        if (state.viewMode === "saved") {
            state.viewMode = "saved";
            followingBtn.classList.remove("primary-btn");
            followingBtn.classList.add("secondary-btn");
        }
        renderFeed();
    });

    followingBtn?.addEventListener("click", () => {
        state.viewMode = state.viewMode === "following" ? "all" : "following";
        followingBtn.classList.toggle("primary-btn", state.viewMode === "following");
        followingBtn.classList.toggle("secondary-btn", state.viewMode !== "following");
        if (state.viewMode === "following") {
            savedBtn.classList.remove("primary-btn");
            savedBtn.classList.add("secondary-btn");
        }
        renderFeed();
    });

    moderationBtn?.addEventListener("click", () => {
        moderationPanel?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    moderationList?.addEventListener("click", async (event) => {
        const button = event.target.closest("button[data-action]");
        if (!button) return;
        const action = button.getAttribute("data-action");
        const reportId = Number(button.getAttribute("data-report-id"));
        const videoId = Number(button.getAttribute("data-video-id"));
        if (action === "moderation-hide") await moderateReport(reportId, videoId, "hide");
        if (action === "moderation-dismiss") await moderateReport(reportId, videoId, "dismiss");
        if (action === "moderation-review") await moderateReport(reportId, videoId, "review");
    });

    sendCommentBtn?.addEventListener("click", submitComment);
    closeCommentsBtn?.addEventListener("click", closeComments);
    closeReportBtn?.addEventListener("click", closeReport);
    submitReportBtn?.addEventListener("click", submitReport);

    commentsModal?.addEventListener("click", (event) => {
        if (event.target === commentsModal) closeComments();
    });

    reportModal?.addEventListener("click", (event) => {
        if (event.target === reportModal) closeReport();
    });

    uploadShortcut?.addEventListener("click", () => {
        window.location.href = "grow-upload.html";
    });
    heroUpload?.addEventListener("click", () => {
        window.location.href = "grow-upload.html";
    });

    window.addEventListener("online", () => {
        toggleOfflineState();
        loadGrowData({ showLoading: false });
    });
    window.addEventListener("offline", toggleOfflineState);
}

function subscribeRealtime() {
    const channel = supabase
        .channel("freshlink-grow-live")
        .on("postgres_changes", { event: "*", schema: "public", table: "grow_videos" }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "grow_video_comments" }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "grow_notifications" }, scheduleReload)
        .on("postgres_changes", { event: "*", schema: "public", table: "grow_reports" }, scheduleReload)
        .subscribe();

    window.addEventListener("beforeunload", () => {
        channel.unsubscribe();
        if (state.observer) state.observer.disconnect();
    });
}

function scheduleReload() {
    window.clearTimeout(state.debounceTimer);
    state.debounceTimer = window.setTimeout(() => {
        loadGrowData({ showLoading: false });
    }, 240);
}

async function init() {
    const ok = await getCurrentUserAndProfile();
    if (!ok) return;
    bindStaticEvents();
    await loadGrowData();
    subscribeRealtime();
}

init();