import { supabase } from "./supabase.js";

let currentUser = null;
let currentConversation = null;
let conversationSubscription = null;
let pendingRequests = [];
const LOCAL_REQUESTS_KEY = "freshlink_chat_requests";
const LOCAL_THREAD_KEY = "freshlink_chat_threads";
const chatParams = new URLSearchParams(window.location.search);

async function sendMessageText(content) {
    const text = String(content || "").trim();
    if (!text || !currentConversation || !currentUser?.email) return false;

    const { error } = await supabase
        .from("messages")
        .insert([{
            sender_id: currentUser.id,
            sender_email: currentUser.email,
            receiver_id: null,
            receiver_email: currentConversation.userEmail,
            content: text,
            read_at: null
        }]);

    if (error) {
        console.error("Error sending message:", error);
        const status = document.getElementById("chatUserStatus");
        if (status) status.innerText = "Failed to send message";
        return false;
    }

    // Ensure immediate in-app refresh even before realtime event arrives.
    await loadMessages(currentConversation.userEmail);
    return true;
}

async function init() {
    const { data } = await supabase.auth.getSession();
    currentUser = data?.session?.user;

    if (!currentUser) {
        window.location.href = "index.html";
        return;
    }

    loadRequests();
    await loadConversations();
    await handleRouteIntent();
    
    setInterval(() => {
        loadRequests();
        loadConversations();
    }, 5000);
}

async function handleRouteIntent() {
    const sellerEmail = normalizeEmail(chatParams.get("seller"));
    const farmName = String(chatParams.get("farm") || "Seller").trim();
    const productTitle = String(chatParams.get("product") || "product").trim();
    const action = String(chatParams.get("action") || "chat").trim().toLowerCase();
    const intentId = String(chatParams.get("intent_id") || "").trim();

    if (!sellerEmail || !sellerEmail.includes("@")) {
        return;
    }

    await window.openConversation(sellerEmail);

    const input = document.getElementById("messageInput");
    const status = document.getElementById("chatUserStatus");

    if (!input) return;

    if (action === "call") {
        const callDraft = `Hello ${farmName}, please call me about ${productTitle}. I want to confirm quantity, delivery time, and final price.`;
        input.value = callDraft;

        const dedupeKey = intentId ? `freshlink_auto_call_${intentId}` : "";
        const alreadySent = dedupeKey ? sessionStorage.getItem(dedupeKey) === "1" : false;

        if (!alreadySent) {
            const sent = await sendMessageText(callDraft);
            if (sent) {
                if (dedupeKey) sessionStorage.setItem(dedupeKey, "1");
                input.value = "";
                if (status) status.innerText = "Call request sent in app.";
            } else {
                if (status) status.innerText = "Call request ready. Tap Send.";
            }
        } else if (status) {
            status.innerText = "In-app call request ready.";
        }
    } else {
        input.value = `Hello ${farmName}, I am interested in ${productTitle}. Is it still available?`;
        if (status) status.innerText = "In-app chat ready.";
    }
}

function loadRequests() {
    pendingRequests = JSON.parse(localStorage.getItem(LOCAL_REQUESTS_KEY) || "[]");
    renderRequests(pendingRequests);
}

function renderRequests(requests) {
    const section = document.getElementById("requestsSection");
    if (!section) return;

    if (requests.length === 0) {
        section.innerHTML = "";
        return;
    }

    section.innerHTML = `
        <div class="chat-requests">
            <h3>Pending Chat Requests</h3>
            ${requests.map(req => `
                <div class="request-card">
                    <h4>${req.farm}</h4>
                    <p><strong>Product:</strong> ${req.title}</p>
                    <p><strong>Location:</strong> ${req.location}</p>
                    <p><strong>Status:</strong> ${req.status === 'pending' ? 'Waiting for seller reply' : 'Ready to chat'}</p>
                    <button onclick="openRequestConversation('${req.id}')">Open Chat</button>
                </div>
            `).join('')}
        </div>
    `;
}

function normalizeEmail(value) {
    return (value || "").trim().toLowerCase();
}

async function loadConversations() {
    if (!currentUser?.email) {
        renderConversations([]);
        return;
    }

    const { data: messages, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: false });

    if (error) {
        renderConversations([]);
        const status = document.getElementById("chatUserStatus");
        if (status) status.innerText = "Unable to load conversations";
        return;
    }

    const conversationMap = {};

    (messages || []).forEach(msg => {
        const me = normalizeEmail(currentUser?.email);
        const sender = normalizeEmail(msg.sender_email);
        const receiver = normalizeEmail(msg.receiver_email);
        const otherEmail = sender === me ? receiver : sender;

        if (!otherEmail) return;

        if (!conversationMap[otherEmail]) {
            conversationMap[otherEmail] = {
                userEmail: otherEmail,
                lastMessage: msg.content,
                lastTime: msg.created_at,
                unread: receiver === me && !msg.read_at
            };
        }
    });

    const conversations = Object.values(conversationMap).sort((a, b) => 
        new Date(b.lastTime) - new Date(a.lastTime)
    );

    renderConversations(conversations);
}

function renderConversations(conversations) {
    const section = document.getElementById("conversationsSection");
    if (!section) return;

    if (conversations.length === 0) {
        section.innerHTML = `
            <div class="empty-state">
                <h2>No conversations yet</h2>
                <p>Request a chat from a product page to start messaging.</p>
            </div>
        `;
        return;
    }

    section.innerHTML = conversations.map(conv => `
        <div class="conversation ${currentConversation?.userEmail === conv.userEmail ? 'active' : ''}" onclick="openConversation('${conv.userEmail}')">
            <div class="conv-avatar">
                ${conv.userEmail.charAt(0).toUpperCase()}
                <div class="status"></div>
            </div>
            <div class="conv-info">
                <div class="conv-header">
                    <div class="conv-name">${conv.userEmail.split('@')[0]}</div>
                    <div class="conv-time">${formatTime(conv.lastTime)}</div>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="conv-preview">${conv.lastMessage}</div>
                    ${conv.unread ? '<div class="conv-unread">New</div>' : ''}
                </div>
            </div>
        </div>
    `).join('');
}

window.openConversation = async function (userEmail) {
    currentConversation = { userEmail, userId: userEmail };
    document.getElementById("chatUserName").innerText = userEmail.split('@')[0];
    document.getElementById("chatAvatar").innerText = userEmail.charAt(0).toUpperCase();
    document.getElementById("chatUserStatus").innerText = currentUser ? "Online" : "Sign in to chat";
    document.getElementById("chatView").classList.add("active");

    await loadMessages(userEmail);

    if (!currentUser) {
        return;
    }

    if (conversationSubscription) {
        await conversationSubscription.unsubscribe();
    }

    conversationSubscription = supabase
        .channel("freshlink-chat")
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'messages'
            },
            (payload) => {
                const me = normalizeEmail(currentUser?.email);
                const sender = normalizeEmail(payload.new.sender_email);
                const receiver = normalizeEmail(payload.new.receiver_email);
                const activeEmail = normalizeEmail(currentConversation?.userEmail);

                if ((sender === me && receiver === activeEmail) || (receiver === me && sender === activeEmail)) {
                    loadMessages(activeEmail);
                }
            }
        )
        .subscribe();
    };

window.openRequestConversation = function (requestId) {
    const req = pendingRequests.find(r => r.id === requestId);
    if (!req) return;

    currentConversation = {
        requestId: req.id,
        userEmail: req.email,
        farm: req.farm,
        title: req.title
    };

    document.getElementById("chatUserName").innerText = req.farm;
    document.getElementById("chatAvatar").innerText = req.farm.charAt(0).toUpperCase();
    document.getElementById("chatUserStatus").innerText = "Chat requested";
    document.getElementById("chatView").classList.add("active");

    if (conversationSubscription) {
        conversationSubscription.unsubscribe();
        conversationSubscription = null;
    }

    loadMessages(req.email);
};

async function loadMessages(userEmail) {
    const targetEmail = normalizeEmail(userEmail);

    if (!currentUser?.email) {
        renderMessages([]);
        return;
    }

    if (!targetEmail) {
        renderMessages([]);
        return;
    }

    const { data: messages, error } = await supabase
        .from("messages")
        .select("*")
        .order("created_at", { ascending: true });

    if (error) {
        renderMessages([]);
        const status = document.getElementById("chatUserStatus");
        if (status) status.innerText = "Unable to load messages";
        return;
    }

    if (!messages) messages = [];

    const filtered = (messages || []).filter(msg => {
        const me = normalizeEmail(currentUser?.email);
        const sender = normalizeEmail(msg.sender_email);
        const receiver = normalizeEmail(msg.receiver_email);
        return (sender === me && receiver === targetEmail) || (receiver === me && sender === targetEmail);
    });

    renderMessages(filtered, targetEmail);

    if (filtered.length) {
        await supabase
            .from("messages")
            .update({ read_at: new Date().toISOString() })
            .eq("receiver_email", normalizeEmail(currentUser?.email))
            .eq("sender_email", targetEmail)
            .is("read_at", null);
    }
}

function renderMessages(messages) {
    const container = document.getElementById("chatMessages");
    if (!container) return;

    if (!messages.length) {
        container.innerHTML = `
            <div class="empty-state">
                <h2>Start the conversation</h2>
                <p>Send the first message and it will appear here in real time.</p>
            </div>
        `;
        container.scrollTop = 0;
        return;
    }

    container.innerHTML = messages.map(msg => {
        const isSent = normalizeEmail(msg.sender_email) === normalizeEmail(currentUser?.email);
        const senderLabel = msg.sender_email ? msg.sender_email : "U";

        return `
            <div class="message ${isSent ? 'sent' : ''}">
                ${!isSent ? `<div class="message-avatar">${senderLabel.charAt(0).toUpperCase()}</div>` : ''}
                <div>
                    <div class="message-bubble">${escapeHtml(msg.content)}</div>
                    <div class="message-time">${formatTime(msg.created_at)}</div>
                </div>
            </div>
        `;
    }).join('');

    container.scrollTop = container.scrollHeight;
}

window.sendMessage = async function () {
    const input = document.getElementById("messageInput");
    const content = input.value.trim();

    if (!content || !currentConversation) return;

    if (!currentUser?.email) {
        const status = document.getElementById("chatUserStatus");
        if (status) status.innerText = "Sign in required to send messages";
        return;
    }

    input.value = "";
    await sendMessageText(content);
};

window.callUser = function () {
    if (!currentConversation?.userEmail) return;
    const input = document.getElementById("messageInput");
    const status = document.getElementById("chatUserStatus");
    const sellerName = currentConversation.userEmail.split('@')[0];

    if (input) {
        input.value = `Hello ${sellerName}, please call me back in this chat about my order.`;
    }
    if (status) status.innerText = "Call request drafted in app. Tap Send.";
};

window.viewProfile = function () {
    if (!currentConversation?.userEmail) return;
    window.location.href = `profile.html?email=${encodeURIComponent(currentConversation.userEmail)}&farm=${encodeURIComponent(currentConversation.userEmail.split('@')[0])}`;
};

function formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "now";
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

const messageInput = document.getElementById("messageInput");
if (messageInput) {
    messageInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            window.sendMessage();
        }
    });
}

init();
