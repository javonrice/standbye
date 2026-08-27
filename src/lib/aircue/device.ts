const KEY = "aircue.device-id";

/** Stable per-browser id used to group guest trips and watches. Client-only. */
export function getDeviceId(): string {
  if (typeof window === "undefined") return "";
  let id = window.localStorage.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    window.localStorage.setItem(KEY, id);
  }
  return id;
}

const EMAIL_KEY = "aircue.alert-email";

export function getSavedEmail(): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(EMAIL_KEY) ?? "";
}

export function saveEmail(email: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(EMAIL_KEY, email);
}
