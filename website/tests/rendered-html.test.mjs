import assert from "node:assert/strict";
import test from "node:test";

async function render(route = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${route}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${route}`, {
      headers: {
        accept: "text/html",
        host: "localhost",
        "x-forwarded-host": "localhost",
        "x-forwarded-proto": "http",
      },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the complete Thirty Nights landing page", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Thirty Nights — Hear what time reveals<\/title>/i);
  assert.match(html, /Hear what your life has been trying to tell you\./);
  assert.match(html, /Speak\. Seal\. Return\./);
  assert.match(html, /Your first seven are free/i);
  assert.match(html, /Coming soon on iOS &amp; Android/i);
  assert.match(html, /Join the waitlist/i);
  assert.match(html, /FOUNDING WAITLIST/i);
  assert.doesNotMatch(html, /Google Play|play\.google\.com/i);
  assert.match(html, /http:\/\/localhost\/og\.png/);
  assert.match(html, /<a class="brand" href="\/" aria-label="Thirty Nights home">/);
  assert.match(html, /favicon-32x32\.png\?v=2/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("renders every production legal and support route", async () => {
  const routes = [
    ["/privacy", /PRIVACY POLICY/, /Cloud backup and AI-assisted reflections/],
    ["/terms", /TERMS &amp; CONDITIONS/, /Purchases and refunds/],
    ["/delete-account", /ACCOUNT DELETION/, /Start a deletion request/i],
    ["/support", /SUPPORT/, /How can we help\?/i],
  ];

  for (const [route, heading, content] of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    const html = await response.text();
    assert.match(html, heading, route);
    assert.match(html, content, route);
    assert.match(html, /Effective and last updated.*August 20, 2026/, route);
    assert.match(html, /<a class="brand" href="\/" aria-label="Thirty Nights home">/, route);
    assert.match(html, /<a class="nav-download" href="\/">Back to the landing page<\/a>/, route);
    assert.doesNotMatch(html, /placeholder|review before launch/i, route);
    assert.doesNotMatch(html, /og\.png/, `${route} should not inherit the landing-page social image`);
  }
});
