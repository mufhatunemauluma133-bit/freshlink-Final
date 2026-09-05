import { supabase } from "./supabase.js";

let currentUser = null;

async function init() {
    const { data } = await supabase.auth.getSession();
    currentUser = data?.session?.user;

    if (!currentUser) {
        window.location.href = "index.html";
        return;
    }
}

window.postJob = async function () {
    const titleEl = document.getElementById("title");
    const jobTypeEl = document.getElementById("jobType");
    const locationEl = document.getElementById("location");
    const durationEl = document.getElementById("duration");
    const salaryMinEl = document.getElementById("salaryMin");
    const salaryMaxEl = document.getElementById("salaryMax");
    const descriptionEl = document.getElementById("description");
    const requirementsEl = document.getElementById("requirements");
    const contactWhatsappEl = document.getElementById("contactWhatsapp");
    const contactEmailEl = document.getElementById("contactEmail");
    const msg = document.getElementById("msg");

    if (!msg) return;
    msg.innerText = "";

    if (!currentUser) {
        msg.innerText = "Sign in with a real account to publish jobs.";
        msg.style.color = "#fca5a5";
        return;
    }

    const title = (titleEl?.value || "").trim().substring(0, 200);
    const jobType = (jobTypeEl?.value || "").trim().substring(0, 50);
    const location = (locationEl?.value || "").trim().substring(0, 100);
    const duration = (durationEl?.value || "").trim().substring(0, 50);
    const salaryMin = Number(salaryMinEl?.value || 0);
    const salaryMax = Number(salaryMaxEl?.value || 0);
    const description = (descriptionEl?.value || "").trim().substring(0, 2000);
    const requirements = (requirementsEl?.value || "").trim().substring(0, 1000);
    const contactWhatsapp = (contactWhatsappEl?.value || "").trim().replace(/\D/g, '').substring(0, 15);
    const contactEmail = (contactEmailEl?.value || "").trim().toLowerCase().substring(0, 100);

    if (!title || !jobType || !location || !description || !requirements || !contactWhatsapp || !contactEmail) {
        msg.innerText = "Please fill in all required fields";
        return;
    }

    if (salaryMin <= 0 || salaryMax <= 0 || salaryMin > salaryMax) {
        msg.innerText = "Please enter valid salary range with positive values";
        return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(contactEmail)) {
        msg.innerText = "Please enter a valid email address";
        return;
    }

    const { error } = await supabase
        .from("jobs")
        .insert([{
            title,
            job_type: jobType,
            location,
            duration,
            salary_min: parseInt(salaryMin),
            salary_max: parseInt(salaryMax),
            description,
            requirements,
            contact_whatsapp: contactWhatsapp,
            contact_email: contactEmail,
            posted_by: currentUser.email.split('@')[0],
            posted_by_type: "Farmer/Supplier",
            posted_by_id: currentUser.id,
            status: "open"
        }]);

    if (error) {
        msg.innerText = "Error posting job: " + error.message;
    } else {
        msg.innerText = "Job posted successfully! ✓";
        msg.style.color = "#a7f3d0";
        
        setTimeout(() => {
            window.location.href = "jobs.html";
        }, 1500);
    }
};

init();
