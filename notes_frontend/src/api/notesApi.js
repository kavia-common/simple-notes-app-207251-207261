/**
 * Notes API client (REST).
 *
 * Uses a configurable base URL:
 * - If REACT_APP_NOTES_API_URL is set, it will be used.
 * - Otherwise, defaults to same-origin (useful when a proxy is configured).
 */

const DEFAULT_BASE_URL = "";

/**
 * Attempt to read API base URL from environment.
 * CRA exposes env vars prefixed with REACT_APP_*
 */
function getBaseUrl() {
  return (process.env.REACT_APP_NOTES_API_URL || DEFAULT_BASE_URL).replace(/\/$/, "");
}

// PUBLIC_INTERFACE
export async function listNotes({ signal } = {}) {
  /** Fetch all notes. Returns array of notes. */
  return requestJson(`${getBaseUrl()}/notes`, { method: "GET", signal });
}

// PUBLIC_INTERFACE
export async function getNote(noteId, { signal } = {}) {
  /** Fetch a single note by id. Returns note. */
  return requestJson(`${getBaseUrl()}/notes/${encodeURIComponent(noteId)}`, {
    method: "GET",
    signal,
  });
}

// PUBLIC_INTERFACE
export async function createNote(payload, { signal } = {}) {
  /** Create a new note. Payload: {title, content}. Returns created note. */
  return requestJson(`${getBaseUrl()}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

// PUBLIC_INTERFACE
export async function updateNote(noteId, payload, { signal } = {}) {
  /** Update note by id. Payload: {title, content}. Returns updated note. */
  return requestJson(`${getBaseUrl()}/notes/${encodeURIComponent(noteId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
}

// PUBLIC_INTERFACE
export async function deleteNote(noteId, { signal } = {}) {
  /** Delete note by id. Returns nothing (or server response). */
  return requestJson(`${getBaseUrl()}/notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
    signal,
  });
}

async function requestJson(url, options) {
  const res = await fetch(url, options);

  // Try to parse error payloads, but don't crash if non-JSON.
  const contentType = res.headers.get("content-type") || "";
  const isJson = contentType.includes("application/json");

  if (!res.ok) {
    let details = "";
    if (isJson) {
      try {
        const data = await res.json();
        details = data?.detail ? `: ${String(data.detail)}` : "";
      } catch {
        // ignore
      }
    } else {
      try {
        const text = await res.text();
        details = text ? `: ${text}` : "";
      } catch {
        // ignore
      }
    }
    throw new Error(`Request failed (${res.status} ${res.statusText})${details}`);
  }

  if (res.status === 204) return null;
  if (!isJson) return null;

  return res.json();
}
