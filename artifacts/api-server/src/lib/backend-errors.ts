export interface ApiFailureFallback {
  code: string;
  error: string;
  status?: number;
}

export interface ApiFailureResponse {
  status: number;
  body: {
    code: string;
    error: string;
  };
}

function rootError(error: unknown): unknown {
  let current = error;
  const seen = new Set<unknown>();

  while (
    typeof current === "object" &&
    current !== null &&
    "cause" in current &&
    !seen.has(current)
  ) {
    seen.add(current);
    const cause = (current as { cause?: unknown }).cause;
    if (cause === undefined) break;
    current = cause;
  }

  return current;
}

function errorFields(error: unknown): {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
} {
  if (typeof error !== "object" || error === null) return {};

  const candidate = error as {
    name?: unknown;
    code?: unknown;
    status?: unknown;
    message?: unknown;
  };

  return {
    ...(typeof candidate.name === "string" ? { name: candidate.name } : {}),
    ...(typeof candidate.code === "string" ? { code: candidate.code } : {}),
    ...(typeof candidate.status === "number" ? { status: candidate.status } : {}),
    ...(typeof candidate.message === "string"
      ? { message: candidate.message }
      : {}),
  };
}

function safeMessage(message: string): string {
  return message
    .replace(/0x[a-f\d]{40}/gi, "[wallet address]")
    .replace(
      /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
      "[email]",
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[id]",
    )
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
    .replace(/\beyJ[A-Za-z0-9._-]{20,}\b/g, "[redacted token]")
    .slice(0, 400);
}

export function getSafeBackendErrorFields(error: unknown): {
  backendErrorType: string;
  backendCode?: string;
  backendStatus?: number;
  backendMessage?: string;
} {
  const fields = errorFields(rootError(error));
  return {
    backendErrorType: fields.name ?? "UnknownError",
    ...(fields.code ? { backendCode: fields.code } : {}),
    ...(fields.status ? { backendStatus: fields.status } : {}),
    ...(fields.message ? { backendMessage: safeMessage(fields.message) } : {}),
  };
}

export function toApiFailure(
  error: unknown,
  fallback: ApiFailureFallback,
): ApiFailureResponse {
  const fields = errorFields(rootError(error));

  if (fields.message === "SUPABASE_SERVICE_ROLE_KEY is not configured") {
    return {
      status: 503,
      body: {
        code: "SUPABASE_SERVICE_ROLE_MISSING",
        error:
          "The server is missing its Supabase service-role key. An administrator must configure it before account sign-in can work.",
      },
    };
  }

  switch (fields.code) {
    case "42501":
      return {
        status: 503,
        body: {
          code: "RLS_DENIED",
          error:
            "Supabase rejected a server-side account operation. Check the service-role configuration and table security policies.",
        },
      };
    case "42P01":
    case "PGRST205":
      return {
        status: 503,
        body: {
          code: "DATABASE_TABLE_MISSING",
          error:
            "A required Supabase table is missing. Apply the CHOG MATE database migrations, then try again.",
        },
      };
    case "42703":
    case "PGRST204":
      return {
        status: 503,
        body: {
          code: "DATABASE_COLUMN_MISSING",
          error:
            "A required Supabase column is missing. Apply the CHOG MATE database migrations, then try again.",
        },
      };
    case "23503":
      return {
        status: 503,
        body: {
          code: "DATABASE_FOREIGN_KEY_FAILED",
          error:
            "The Supabase account relationship is incomplete. Confirm the Auth account and CHOG MATE migrations are aligned.",
        },
      };
    case "23502":
      return {
        status: 503,
        body: {
          code: "DATABASE_REQUIRED_VALUE_MISSING",
          error:
            "Supabase rejected a required account value. Check the database defaults and submitted profile details.",
        },
      };
    case "23505":
      return {
        status: 409,
        body: {
          code: "DUPLICATE_ACCOUNT",
          error:
            "This wallet is already linked to an account. Sign in to that account or recover it before continuing.",
        },
      };
    default:
      return {
        status: fallback.status ?? 503,
        body: { code: fallback.code, error: fallback.error },
      };
  }
}
