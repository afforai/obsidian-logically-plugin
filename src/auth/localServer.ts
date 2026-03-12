import { createServer, type Server } from "http";
import { URL } from "url";

const CALLBACK_HTML = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Google Login</title>
  </head>
  <body>
    <p>You can close this tab now.</p>
    <script>
      const hash = location.hash.substring(1)
      fetch("/token?" + hash)
    </script>
  </body>
</html>`;

interface LocalOAuthServer {
  waitForToken: () => Promise<string>;
  close: () => Promise<void>;
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

export async function createLocalOAuthServer(
  port: number,
  timeoutMs = 120_000,
): Promise<LocalOAuthServer> {
  const tokenDeferred = createDeferred<string>();
  let isSettled = false;
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", `http://127.0.0.1:${port}`);

    if (url.pathname === "/") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(CALLBACK_HTML);
      return;
    }

    if (url.pathname === "/token") {
      const oauthError = url.searchParams.get("error");
      if (oauthError) {
        const errorDescription =
          url.searchParams.get("error_description") || oauthError;
        if (!isSettled) {
          isSettled = true;
          tokenDeferred.reject(
            new Error(`Google OAuth cancelled: ${errorDescription}`),
          );
        }
        response.writeHead(400, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Google login failed. You can close this tab.");
        return;
      }

      const accessToken = url.searchParams.get("access_token");
      if (!accessToken) {
        if (!isSettled) {
          isSettled = true;
          tokenDeferred.reject(
            new Error("Google OAuth token missing in callback"),
          );
        }
        response.writeHead(400, {
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Token missing. You can close this tab.");
        return;
      }

      if (!isSettled) {
        isSettled = true;
        tokenDeferred.resolve(accessToken);
      }

      response.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Login complete. You can close this tab.");
      return;
    }

    if (url.pathname === "/favicon.ico") {
      response.writeHead(204);
      response.end();
      return;
    }

    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "EADDRINUSE") {
        reject(new Error(`OAuth callback port ${port} is already in use`));
        return;
      }
      reject(error);
    });

    server.listen(port, "127.0.0.1", () => {
      server.removeAllListeners("error");
      resolve();
    });
  });

  timeoutHandle = setTimeout(() => {
    if (isSettled) return;
    isSettled = true;
    tokenDeferred.reject(
      new Error("Google login timed out after 120 seconds. Please try again."),
    );
  }, timeoutMs);

  return {
    waitForToken: async () => {
      try {
        const token = await tokenDeferred.promise;
        return token;
      } finally {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
        await closeServer(server).catch(() => undefined);
      }
    },
    close: async () => {
      if (!isSettled) {
        isSettled = true;
        tokenDeferred.reject(
          new Error("Google login cancelled before completion"),
        );
      }
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
        timeoutHandle = null;
      }
      await closeServer(server).catch(() => undefined);
    },
  };
}
