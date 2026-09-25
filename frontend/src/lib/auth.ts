import Cookies from "js-cookie";
import type { JwtPayload } from "@/types";

export function getAccessToken(): string | null {
  return Cookies.get("access_token") ?? null;
}

// Kratkotrajni dostopni žeton (15 min) je v JS piškotu; refresh žeton postavi
// strežnik v httpOnly piškot (sums_refresh) — JavaScript do njega nima dostopa.
export function setTokens(accessToken: string) {
  Cookies.set("access_token", accessToken, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: 1 / 24,
  });
  Cookies.remove("refresh_token"); // star JS piškot iz prejšnjih različic
}

export function clearTokens() {
  Cookies.remove("access_token");
  Cookies.remove("refresh_token");
}

// Nov dostopni žeton iz httpOnly piškota (po poteku ali ob ponovnem nalaganju strani)
export async function refreshAccessToken(): Promise<boolean> {
  try {
    const res = await fetch("/api/v1/auth/refresh", { method: "POST", credentials: "same-origin" });
    if (!res.ok) return false;
    const data = (await res.json()) as { access_token: string };
    setTokens(data.access_token);
    return true;
  } catch {
    return false;
  }
}

export function parseJwt(token: string): JwtPayload | null {
  try {
    const base64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export function isTokenExpired(token: string): boolean {
  const payload = parseJwt(token);
  if (!payload) return true;
  return payload.exp * 1000 < Date.now();
}

export function getCurrentUser(): JwtPayload | null {
  const token = getAccessToken();
  if (!token) return null;
  if (isTokenExpired(token)) return null;
  return parseJwt(token);
}
