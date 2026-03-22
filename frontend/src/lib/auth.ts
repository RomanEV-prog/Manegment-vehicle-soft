import Cookies from "js-cookie";
import type { JwtPayload } from "@/types";

export function getAccessToken(): string | null {
  return Cookies.get("access_token") ?? null;
}

export function setTokens(accessToken: string, refreshToken: string) {
  Cookies.set("access_token", accessToken, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: 1 / 24, // 1 hour
  });
  Cookies.set("refresh_token", refreshToken, {
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    expires: 7, // 7 days
  });
}

export function clearTokens() {
  Cookies.remove("access_token");
  Cookies.remove("refresh_token");
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
