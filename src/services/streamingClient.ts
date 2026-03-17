import * as http from "http";
import * as https from "https";
import { URL } from "url";
import type { ApiResponse, SourceNode } from "../types";

export type StreamHandler = {
  onChunk: (chunk: string) => void;
  onComplete: () => void;
  onError: (error: string) => void;
  onCitation?: (sources: SourceNode[]) => void;
};

export type AutoSuggestStreamHandler = {
  onChunk?: (chunk: string) => void;
  signal?: AbortSignal;
};

type ParseError = (json: unknown, status: number) => string;

const STREAM_TOKEN_REGEX = /❬([A-Z_]+)❭([\s\S]*?)❬\/\1❭/g;

const unescapeStream = (value: string) =>
  value.replace(/❪/g, "❬").replace(/❫/g, "❭");

function getRequestClient(protocol: string): typeof https | typeof http {
  return protocol === "http:" ? http : https;
}

export async function streamCompletionViaRequestUrl(
  url: string,
  body: string,
  headers: Record<string, string>,
  parseError: ParseError,
  handlers: StreamHandler,
): Promise<void> {
  const parsedUrl = new URL(url);
  const client = getRequestClient(parsedUrl.protocol);

  return new Promise((resolve) => {
    const req = client.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers,
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          let errorBody = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            errorBody += String(chunk);
          });
          res.on("end", () => {
            try {
              const parsed: unknown = errorBody ? JSON.parse(errorBody) : null;
              handlers.onError(parseError(parsed, statusCode));
            } catch {
              handlers.onError(parseError(errorBody || null, statusCode));
            }
            resolve();
          });
          return;
        }

        consumeNodeStream(res, handlers)
          .then(resolve)
          .catch((err) => {
            handlers.onError(err instanceof Error ? err.message : String(err));
            resolve();
          });
      },
    );

    req.on("error", (err) => {
      handlers.onError(err instanceof Error ? err.message : String(err));
      resolve();
    });

    req.write(body);
    req.end();
  });
}

export async function streamAutoSuggestMarkdown(
  url: string,
  body: string,
  headers: Record<string, string>,
  parseError: ParseError,
  handlers?: AutoSuggestStreamHandler,
): Promise<ApiResponse<{ suggestion: string }>> {
  const parsedUrl = new URL(url);
  const client = getRequestClient(parsedUrl.protocol);

  return await new Promise((resolve) => {
    let done = false;
    const finalize = (value: ApiResponse<{ suggestion: string }>) => {
      if (done) return;
      done = true;
      if (handlers?.signal) {
        handlers.signal.removeEventListener("abort", onAbort);
      }
      resolve(value);
    };

    const req = client.request(
      {
        protocol: parsedUrl.protocol,
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || undefined,
        path: parsedUrl.pathname + parsedUrl.search,
        method: "POST",
        headers,
      },
      (res) => {
        const statusCode = res.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          let errorBody = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            errorBody += String(chunk);
          });
          res.on("end", () => {
            try {
              const parsed: unknown = errorBody ? JSON.parse(errorBody) : null;
              finalize({
                success: false,
                error: parseError(parsed, statusCode),
              });
            } catch {
              finalize({
                success: false,
                error: parseError(errorBody || null, statusCode),
              });
            }
          });
          return;
        }

        const decoder = new TextDecoder();
        let suggestion = "";
        res.on("data", (chunk) => {
          const text =
            typeof chunk === "string"
              ? chunk
              : decoder.decode(chunk as Uint8Array, { stream: true });
          suggestion += text;
          handlers?.onChunk?.(text);
        });
        res.on("end", () => {
          finalize({ success: true, data: { suggestion } });
        });
        res.on("error", (err) => {
          finalize({
            success: false,
            error: err instanceof Error ? err.message : String(err),
          });
        });
      },
    );

    const onAbort = () => {
      req.destroy(new Error("AbortError"));
      finalize({ success: false, error: "AbortError" });
    };

    if (handlers?.signal) {
      if (handlers.signal.aborted) {
        onAbort();
        return;
      }
      handlers.signal.addEventListener("abort", onAbort, { once: true });
    }

    req.on("error", (err) => {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("AbortError")) {
        finalize({ success: false, error: "AbortError" });
        return;
      }
      finalize({
        success: false,
        error: message,
      });
    });

    req.write(body);
    req.end();
  });
}

async function consumeNodeStream(
  body: NodeJS.ReadableStream,
  handlers: StreamHandler,
): Promise<void> {
  const decoder = new TextDecoder();
  let buffer = "";
  let completed = false;

  const handlePacket = (key: string, rawValue: string) => {
    const payload = unescapeStream(rawValue);
    switch (key) {
      case "COMPLETION": {
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          const chunk = parsed.chunk;
          if (typeof chunk === "string") handlers.onChunk(chunk);
          else handlers.onChunk(JSON.stringify(parsed));
        } catch {
          handlers.onChunk(payload);
        }
        break;
      }
      case "CITATION": {
        if (handlers.onCitation) {
          try {
            const parsed = JSON.parse(payload) as Record<string, unknown>;
            const nodes = parsed.nodes;
            if (nodes && Array.isArray(nodes)) {
              const sources: SourceNode[] = (
                nodes as Record<string, unknown>[]
              ).map((n) => ({
                fileid: n.fileid as string | undefined,
                filename: (n.filename as string) ?? "Unknown",
                filetype: (n.filetype as string) ?? "",
                url: n.url as string | undefined,
                pdfUrl: n.pdfUrl as string | undefined,
                pages: n.pages as number[] | undefined,
                content: n.content as string | undefined,
                citationCount: (n.others as Record<string, unknown> | undefined)
                  ?.citation_count as number | undefined,
                referenceCount: (
                  n.others as Record<string, unknown> | undefined
                )?.reference_count as number | undefined,
              }));
              handlers.onCitation(sources);
            }
          } catch {
            // Ignore citation parse errors
          }
        }
        break;
      }
      case "ERROR": {
        try {
          const parsed = JSON.parse(payload) as Record<string, unknown>;
          const code = parsed.code;
          const message = parsed.message;
          handlers.onError(
            (typeof code === "string" ? code : null) ??
              (typeof message === "string" ? message : null) ??
              "Request failed",
          );
        } catch {
          handlers.onError(payload || "Request failed");
        }
        completed = true;
        break;
      }
      case "DONE": {
        completed = true;
        handlers.onComplete();
        break;
      }
      default:
        break;
    }
  };

  const flushBuffer = () => {
    STREAM_TOKEN_REGEX.lastIndex = 0;
    let match: RegExpExecArray | null;
    let lastIndex = 0;
    while ((match = STREAM_TOKEN_REGEX.exec(buffer)) !== null) {
      lastIndex = STREAM_TOKEN_REGEX.lastIndex;
      const key = match[1];
      const value = match[2];
      if (key && value !== undefined) {
        handlePacket(key, value);
      }
    }
    buffer = buffer.slice(lastIndex);
  };

  return await new Promise((resolve) => {
    const onData = (chunk: unknown) => {
      if (completed) return;
      if (typeof chunk === "string") {
        buffer += chunk;
      } else {
        buffer += decoder.decode(chunk as Uint8Array, { stream: true });
      }
      flushBuffer();
      if (completed) {
        body.removeListener("data", onData);
        body.removeListener("end", onEnd);
        body.removeListener("error", onError);
        resolve();
      }
    };

    const onEnd = () => {
      flushBuffer();
      if (!completed) handlers.onComplete();
      body.removeListener("data", onData);
      body.removeListener("end", onEnd);
      body.removeListener("error", onError);
      resolve();
    };

    const onError = (err: unknown) => {
      handlers.onError(err instanceof Error ? err.message : String(err));
      body.removeListener("data", onData);
      body.removeListener("end", onEnd);
      body.removeListener("error", onError);
      resolve();
    };

    body.on("data", onData);
    body.on("end", onEnd);
    body.on("error", onError);
  });
}
