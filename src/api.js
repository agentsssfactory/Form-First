export async function api(path, { method = "GET", body } = {}) {
  let res;
  try {
    res = await fetch("/api" + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      credentials: "same-origin",
    });
  } catch {
    throw new Error("Can't reach the server. Make sure the API is running (npm run dev starts both).");
  }
  let data = {};
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    const down = !data.error && res.status >= 500;
    const err = new Error(data.error || (down ? "The API isn't responding (is the server running on port 4000?)." : "Something went wrong."));
    err.status = res.status;
    throw err;
  }
  return data;
}

const dateFmt = new Intl.DateTimeFormat(undefined, { day: "2-digit", month: "short", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" });
export const fmtDate = (iso) => dateFmt.format(new Date(iso));
export const fmtTime = (iso) => timeFmt.format(new Date(iso));
export const fmtWhen = (iso) => `${fmtDate(iso)} · ${fmtTime(iso)}`;

export function money(cents, currency = "INR") {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency, maximumFractionDigits: 2 }).format((cents || 0) / 100);
  } catch {
    return `${currency} ${((cents || 0) / 100).toFixed(2)}`;
  }
}
export const fmtDay = (iso) => (iso ? dateFmt.format(new Date(iso + (iso.length === 10 ? "T00:00:00" : ""))) : "");
