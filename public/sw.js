// Minimal service worker — enables "Add to Home Screen" installability and
// caches static build assets for faster repeat loads. Deliberately does NOT
// cache pages or API responses: this app is authenticated and data-heavy
// (case records, evidence, timeline reconstructions), so serving stale or
// cached content for navigation/API requests would be actively wrong. Only
// immutable, content-hashed static assets are safe to cache.

const CACHE_NAME = "kavalan-static-v1";

self.addEventListener("install", (event) => {
	self.skipWaiting();
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME)
					.map((key) => caches.delete(key)),
			),
		),
	);
	self.clients.claim();
});

self.addEventListener("fetch", (event) => {
	const url = new URL(event.request.url);

	// Only handle same-origin GET requests for hashed static build assets.
	const isStaticAsset =
		event.request.method === "GET" &&
		url.origin === self.location.origin &&
		url.pathname.startsWith("/_next/static/");

	if (!isStaticAsset) return; // let everything else (pages, API) hit the network normally

	event.respondWith(
		caches.open(CACHE_NAME).then(async (cache) => {
			const cached = await cache.match(event.request);
			if (cached) return cached;
			const response = await fetch(event.request);
			if (response.ok) cache.put(event.request, response.clone());
			return response;
		}),
	);
});
