const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT_DIR = __dirname;
const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || "0.0.0.0";
const MAX_BODY_SIZE = 32 * 1024;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
	".webp": "image/webp"
};

function sendJson(response, statusCode, payload) {
	const body = JSON.stringify(payload);
	response.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Content-Length": Buffer.byteLength(body),
		"Cache-Control": "no-store"
	});
	response.end(body);
}

function readJsonBody(request) {
	return new Promise((resolve, reject) => {
		let body = "";

		request.setEncoding("utf8");
		request.on("data", (chunk) => {
			body += chunk;
			if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
				reject(new Error("Request body is too large"));
				request.destroy();
			}
		});
		request.on("end", () => {
			try {
				resolve(body ? JSON.parse(body) : {});
			} catch {
				reject(new Error("Request body must be valid JSON"));
			}
		});
		request.on("error", reject);
	});
}

async function answerFarmQuestion(question, mode) {
	const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
	if (!apiKey) {
		throw new Error("OPENROUTER_API_KEY is not configured");
	}

	const systemPrompt = mode === "image"
		? "You are a farm image prompt assistant. Improve the user's farm image prompt into a concise, safe, detailed prompt suitable for an image generation service. Return only the improved prompt."
		: "You are FreshLink's practical farming advisor. Give concise, actionable advice for farmers and buyers. Mention uncertainty when local conditions matter, and do not invent current prices or regulations.";

	const upstreamResponse = await fetch(OPENROUTER_URL, {
		method: "POST",
		headers: {
			"Authorization": `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": process.env.APP_URL || `http://localhost:${PORT}`,
			"X-Title": "FreshLink Farm Assistant"
		},
		body: JSON.stringify({
			model: process.env.OPENROUTER_MODEL || "openai/gpt-4o-mini",
			messages: [
				{ role: "system", content: systemPrompt },
				{ role: "user", content: question }
			],
			temperature: 0.4,
			max_tokens: 500
		})
	});

	const payload = await upstreamResponse.json().catch(() => ({}));
	if (!upstreamResponse.ok) {
		throw new Error(payload?.error?.message || "AI provider request failed");
	}

	const answer = payload?.choices?.[0]?.message?.content;
	if (typeof answer !== "string" || !answer.trim()) {
		throw new Error("AI provider returned an empty response");
	}

	return answer.trim();
}

async function handleFarmAi(request, response) {
	let payload;
	try {
		payload = await readJsonBody(request);
	} catch (error) {
		sendJson(response, 400, { error: error.message });
		return;
	}

	const question = String(payload.question || "").trim();
	const mode = payload.mode === "image" ? "image" : "chat";
	if (!question || question.length > 4000) {
		sendJson(response, 400, { error: "Question must contain 1 to 4000 characters" });
		return;
	}

	try {
		sendJson(response, 200, { answer: await answerFarmQuestion(question, mode) });
	} catch (error) {
		console.error("Farm AI request failed:", error.message);
		sendJson(response, 503, { error: "Farm AI is temporarily unavailable" });
	}
}

function serveStaticFile(request, response, pathname) {
	let decodedPath;
	try {
		decodedPath = decodeURIComponent(pathname);
	} catch {
		sendJson(response, 400, { error: "Invalid URL" });
		return;
	}

	const relativePath = decodedPath === "/" ? "index.html" : decodedPath.replace(/^\/+/, "");
	const filePath = path.resolve(ROOT_DIR, relativePath);
	if (filePath !== ROOT_DIR && !filePath.startsWith(`${ROOT_DIR}${path.sep}`)) {
		sendJson(response, 403, { error: "Forbidden" });
		return;
	}

	fs.stat(filePath, (statError, stats) => {
		if (statError || !stats.isFile()) {
			sendJson(response, 404, { error: "Not found" });
			return;
		}

		response.writeHead(200, {
			"Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
			"X-Content-Type-Options": "nosniff",
			"Cache-Control": "no-cache"
		});
		fs.createReadStream(filePath).pipe(response);
	});
}

const server = http.createServer((request, response) => {
	const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

	if (request.method === "OPTIONS") {
		response.writeHead(204, { "Access-Control-Allow-Origin": "*" });
		response.end();
		return;
	}

	if (request.method === "GET" && requestUrl.pathname === "/health") {
		sendJson(response, 200, { status: "ok" });
		return;
	}

	if (request.method === "POST" && requestUrl.pathname === "/api/farm-ai") {
		handleFarmAi(request, response);
		return;
	}

	if (request.method === "GET") {
		serveStaticFile(request, response, requestUrl.pathname);
		return;
	}

	sendJson(response, 405, { error: "Method not allowed" });
});

server.listen(PORT, HOST, () => {
	console.log(`FreshLink server running at http://localhost:${PORT}`);
});
