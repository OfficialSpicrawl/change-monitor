// The star count on the "Star on GitHub" buttons. Fetched from the GitHub API, cached for an hour in localStorage.
// With no answer (offline, rate limited, 0 stars) the button simply has no number, and its size never depends on it.
const API = "https://api.github.com/repos/OfficialSpicrawl/change-monitor";
const KEY = "cm:stars";
const FAILED = "cm:stars-failed"; // when GitHub refused (rate limit), do not ask again for a while
const HOUR = 3600_000;
const BACKOFF = 600_000;

const read = () => {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && Number.isFinite(v.n) && Number.isFinite(v.at) ? v : null;
  } catch {
    return null;
  }
};
const write = (n) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ n, at: Date.now() }));
  } catch {}
};
const short = (n) => (n < 1000 ? String(n) : `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`);

function show(n) {
  const some = n > 0; // 0 stars: show nothing rather than a lonely 0
  for (const a of document.querySelectorAll("[data-star]")) {
    const count = a.querySelector("[data-count]");
    if (!count) continue;
    count.hidden = !some;
    if (some) count.textContent = short(n);
    if (some) a.setAttribute("aria-label", `Star on GitHub, ${n} ${n === 1 ? "star" : "stars"}`);
    else a.removeAttribute("aria-label");
  }
}

export async function initStars() {
  const cached = read();
  if (cached) show(cached.n);
  if (cached && Date.now() - cached.at < HOUR) return;
  try {
    if (Date.now() - Number(localStorage.getItem(FAILED)) < BACKOFF) return;
  } catch {}
  try {
    const res = await fetch(API, { headers: { Accept: "application/vnd.github+json" } });
    if (!res.ok) {
      try {
        localStorage.setItem(FAILED, String(Date.now()));
      } catch {}
      return;
    }
    const { stargazers_count: n } = await res.json();
    if (Number.isFinite(n) && n >= 0) {
      write(n);
      show(n);
    }
  } catch {}
}
