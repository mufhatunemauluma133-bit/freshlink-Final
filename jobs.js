import { supabase } from "./supabase.js";

let currentUser = null;
let allJobs = [];
let selectedJob = null;
let currentFilter = "all";
const SAVED_JOBS_KEY = "freshlink_saved_jobs";
const jobsStatus = document.getElementById("jobsStatus");

async function init() {
    const { data } = await supabase.auth.getSession();
    currentUser = data?.session?.user;

    if (!currentUser) {
        window.location.href = "index.html";
        return;
    }

    loadJobs();
}

async function loadJobs() {
    const { data: jobs, error } = await supabase
        .from("jobs")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false });

    if (error) {
        allJobs = [];
        showStatus("Unable to load jobs right now. Please check your connection and try again.", "error");
        renderJobs([]);
        return;
    }

    allJobs = (jobs || []).filter(job => job && job.id);
    filterJobs("all");
}

window.filterJobs = function (type, button) {
    currentFilter = type;

    document.querySelectorAll(".filter-btn").forEach(btn => {
        btn.classList.toggle("active", btn === button);
    });

    let filtered = allJobs;
    if (type !== "all") {
        filtered = allJobs.filter(job => String(job.job_type || "").toLowerCase() === String(type).toLowerCase());
    }

    renderJobs(filtered);
};

function renderJobs(jobs) {
    const list = document.getElementById("jobsList");

    if (!list) return;

    if (!jobs || jobs.length === 0) {
        list.innerHTML = `
            <div class="empty-state">
                <h2>No jobs found</h2>
                <p>Check back soon for new opportunities</p>
            </div>
        `;
        return;
    }

    list.innerHTML = jobs.map(job => {
        const title = escapeHtml(job.title || "Untitled opportunity");
        const postedBy = escapeHtml(job.posted_by || "Unknown employer");
        const location = escapeHtml(job.location || "Location not specified");
        const jobType = escapeHtml(job.job_type || "Other farm work");
        const description = escapeHtml(job.description || "No description provided yet.");
        const salaryMin = Number(job.salary_min || 0);
        const salaryMax = Number(job.salary_max || 0);
        const initials = String(job.posted_by || "U").charAt(0).toUpperCase();

        return `
            <div class="job-card" onclick="viewJobDetails(${job.id})">
                <div class="job-header">
                    <div>
                        <div class="job-title">${title}</div>
                        <div class="job-company">
                            <div class="job-company-avatar">${initials}</div>
                            <span>${postedBy}</span>
                        </div>
                    </div>
                    <div class="job-salary">R${salaryMin} - R${salaryMax}</div>
                </div>
                <div class="job-description">${description.substring(0, 100)}${description.length > 100 ? "..." : ""}</div>
                <div class="job-meta">
                    <div class="job-meta-item">📍 ${location}</div>
                    <div class="job-meta-item">📅 ${jobType}</div>
                    <div class="job-type-badge">${jobType.toUpperCase()}</div>
                </div>
                <div class="job-actions">
                    <button class="job-apply-btn" onclick="event.stopPropagation(); applyJob(${job.id})">Apply</button>
                    <button class="job-save-btn" onclick="event.stopPropagation(); saveJob(${job.id})">Save</button>
                </div>
            </div>
        `;
    }).join('');
}

window.viewJobDetails = async function (jobId) {
    const job = allJobs.find(j => j.id === jobId);
    if (!job) return;

    selectedJob = job;
    const modal = document.getElementById("jobModal");
    const content = document.getElementById("modalContent");

    if (!modal || !content) return;

    const postedBy = escapeHtml(job.posted_by || "Unknown employer");
    const postedByType = escapeHtml(job.posted_by_type || "Farm / Supplier");
    const location = escapeHtml(job.location || "Location not specified");
    const jobType = escapeHtml(job.job_type || "Other farm work");
    const description = escapeHtml(job.description || "No description provided yet.");
    const requirements = escapeHtml(job.requirements || "Requirements will be shared by the employer.");
    const contactWhatsapp = escapeHtml(job.contact_whatsapp || "Not provided");
    const contactEmail = escapeHtml(job.contact_email || "Not provided");
    const initials = String(job.posted_by || "U").charAt(0).toUpperCase();

    content.innerHTML = `
        <h2 style="margin: 0 0 12px; color: #f8fafc; font-size: 20px;">${escapeHtml(job.title || "Untitled opportunity")}</h2>

        <div style="display: flex; gap: 12px; margin-bottom: 16px; align-items: center;">
            <div class="job-company-avatar" style="width: 40px; height: 40px; font-size: 16px;">${initials}</div>
            <div>
                <div style="color: #f8fafc; font-weight: 600;">${postedBy}</div>
                <div style="color: #94a3b8; font-size: 12px;">${postedByType}</div>
            </div>
        </div>

        <div style="background: rgba(34, 197, 94, 0.15); padding: 12px 14px; border-radius: 12px; margin-bottom: 16px;">
            <div style="color: #94a3b8; font-size: 12px;">Salary Range</div>
            <div style="color: #22c55e; font-size: 18px; font-weight: 700;">R${Number(job.salary_min || 0)} - R${Number(job.salary_max || 0)}</div>
        </div>

        <div style="margin-bottom: 16px;">
            <div style="color: #94a3b8; font-size: 12px; margin-bottom: 8px;">Job Details</div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="color: #22c55e;">📍</span>
                    <span style="color: #cbd5e1;">${location}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="color: #22c55e;">💼</span>
                    <span style="color: #cbd5e1;">${jobType}</span>
                </div>
                <div style="display: flex; gap: 8px; align-items: center;">
                    <span style="color: #22c55e;">⏱️</span>
                    <span style="color: #cbd5e1;">${escapeHtml(job.duration || 'Not specified')}</span>
                </div>
            </div>
        </div>

        <div style="margin-bottom: 16px;">
            <div style="color: #94a3b8; font-size: 12px; margin-bottom: 8px;">Description</div>
            <div style="color: #cbd5e1; font-size: 13px; line-height: 1.6;">${description}</div>
        </div>

        <div style="margin-bottom: 16px;">
            <div style="color: #94a3b8; font-size: 12px; margin-bottom: 8px;">Requirements</div>
            <div style="color: #cbd5e1; font-size: 13px; line-height: 1.6;">${requirements}</div>
        </div>

        <div style="margin-bottom: 16px;">
            <div style="color: #94a3b8; font-size: 12px; margin-bottom: 8px;">Contact Information</div>
            <div style="background: rgba(15, 23, 42, 0.95); padding: 12px 14px; border-radius: 12px; border: 1px solid rgba(148, 163, 184, 0.12);">
                <div style="color: #cbd5e1;">WhatsApp: ${contactWhatsapp}</div>
                <div style="color: #cbd5e1;">Email: ${contactEmail}</div>
            </div>
        </div>
    `;

    modal.classList.add("active");
};

window.closeJobModal = function () {
    const modal = document.getElementById("jobModal");
    if (modal) modal.classList.remove("active");
    selectedJob = null;
};

window.applyJob = async function (jobId) {
    if (!currentUser) {
        showStatus("Please login to apply for jobs.", "error");
        return;
    }

    const { error } = await supabase
        .from("job_applications")
        .insert([{
            job_id: jobId,
            applicant_id: currentUser.id,
            applicant_email: currentUser.email,
            status: "pending"
        }]);

    if (error) {
        if (error.message.includes("duplicate")) {
            showStatus("You have already applied for this job.", "error");
        } else {
            showStatus("Error applying for job: " + error.message, "error");
        }
    } else {
        showStatus("Application submitted successfully. The employer will contact you soon.", "success");
        closeJobModal();
    }
};

window.saveJob = function (jobId) {
    const job = allJobs.find(item => item.id === jobId);
    if (!job) return;

    const saved = JSON.parse(localStorage.getItem(SAVED_JOBS_KEY) || "[]");
    const exists = saved.some(item => item.id === jobId);
    if (exists) {
        showStatus("This job is already saved.", "error");
        return;
    }

    saved.push({
        id: job.id,
        title: job.title,
        location: job.location,
        job_type: job.job_type,
        saved_at: new Date().toISOString()
    });
    localStorage.setItem(SAVED_JOBS_KEY, JSON.stringify(saved));
    showStatus("Job saved successfully.", "success");
};

window.submitApplication = function () {
    if (selectedJob) {
        applyJob(selectedJob.id);
    }
};

function showStatus(message, type = "success") {
    if (!jobsStatus) return;
    jobsStatus.textContent = message;
    jobsStatus.className = `message ${type}`;
    jobsStatus.style.display = "block";
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

init();
