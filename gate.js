import { supabase } from "./supabase.js";

async function checkUser() {
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

    if (error || !data || data.paid !== true) {
        window.location.href = "payment.html";
        return;
    }

    console.log("Access granted");
}

checkUser();