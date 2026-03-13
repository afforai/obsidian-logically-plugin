import { randomBytes } from "crypto";
import { shell } from "electron";
import { createLocalOAuthServer } from "./localServer";

const GOOGLE_OAUTH_PORT_CANDIDATES = [51789, 51790, 51791, 51792];
const GOOGLE_OAUTH_TIMEOUT_MS = 120_000;
const GOOGLE_CLIENT_ID =
  "783862932638-rikk5840qk4chch9m1gho4utjq71bpb4.apps.googleusercontent.com";

let activeLoginSession: { close: () => Promise<void> } | null = null;

function generateState(): string {
  return randomBytes(32).toString("hex");
}

export function buildGoogleOAuthUrl(port: number, state: string): string {
  const redirectUri = `http://127.0.0.1:${port}`;
  const scope = "openid email profile";

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: "token",
    scope,
    prompt: "consent",
    state,
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function createServerWithPortFallback(state: string) {
  let lastError: unknown = null;

  for (const port of GOOGLE_OAUTH_PORT_CANDIDATES) {
    try {
      const server = await createLocalOAuthServer(
        port,
        state,
        GOOGLE_OAUTH_TIMEOUT_MS,
      );
      return { server, port };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("already in use")) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw new Error(
    `OAuth callback ports are busy (${GOOGLE_OAUTH_PORT_CANDIDATES.join(", ")}). Close other local servers and try again.${
      lastError instanceof Error ? ` Last error: ${lastError.message}` : ""
    }`,
  );
}

async function openExternal(url: string): Promise<void> {
  try {
    await shell.openExternal(url);
    return;
  } catch {
    // Fall through to browser fallback
  }

  const popup = window.open(url, "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Failed to open external browser for Google login");
  }
}

export async function startGoogleLogin(): Promise<string> {
  if (activeLoginSession) {
    throw new Error("Google login is already in progress");
  }

  if (!GOOGLE_CLIENT_ID) {
    throw new Error("Google OAuth client ID is not configured");
  }

  const state = generateState();
  const { server: localServer, port } =
    await createServerWithPortFallback(state);
  activeLoginSession = { close: localServer.close };

  try {
    const oauthUrl = buildGoogleOAuthUrl(port, state);
    await openExternal(oauthUrl);
    const accessToken = await localServer.waitForToken();

    if (!accessToken) {
      throw new Error("Google OAuth token missing");
    }

    return accessToken;
  } finally {
    activeLoginSession = null;
  }
}

export async function cancelGoogleLogin(): Promise<void> {
  const session = activeLoginSession;
  if (!session) return;

  await session.close().catch(() => undefined);
  activeLoginSession = null;
}
