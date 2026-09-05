<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'self' https: data: blob:; script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdn.jsdelivr.net/npm; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; media-src 'self' data: blob: https:; connect-src 'self' https://*.supabase.co https://nominatim.openstreetmap.org https://cdn.jsdelivr.net; font-src 'self' data: https:; frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'">
<meta name="referrer" content="strict-origin-when-cross-origin">
<meta http-equiv="X-Content-Type-Options" content="nosniff">
<meta http-equiv="Permissions-Policy" content="camera=(), microphone=(), geolocation=(self)">
<title>Search Farmers and Products</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<script type="module" src="app.js"></script>

<div class="topbar">
    <button onclick="window.location.href='home.html'">←</button>
    <div class="title">Search</div>
    <div style="width: 30px;"></div>
</div>

<div class="searchbar">
    <input id="searchInput" type="text" placeholder="Search farmers, categories, specialisation, products..." autofocus>
</div>

<div id="feed" class="feed"></div>

<div class="navbar">
    <button onclick="window.location.href='home.html'">Home</button>
    <button onclick="window.location.href='feed.html'">Feed</button>
    <button class="active" onclick="window.location.href='search.html'">Search</button>
    <button onclick="window.location.href='profile.html'">Profile</button>
    <button onclick="window.location.href='menu.html'">More</button>
</div>

<script type="module" src="feed.js"></script>
</body>
</html>
