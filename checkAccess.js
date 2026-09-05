import { supabase } from "./supabase.js";

async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user || !user.id) {
        window.location.href = "index.html";
        return;
    }

    const { data, error } = await supabase
        .from("profiles")
        .select("paid")
        .eq("id", user.id)
        .single();

    if (error || !data) {
        window.location.href = "payment.html";
        return;
    }

    if (data.paid !== true) {
        window.location.href = "payment.html";
        return;
    }
}

checkAccess();