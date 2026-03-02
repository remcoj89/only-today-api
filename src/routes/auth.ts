import { Router } from "express";
import { getSupabaseAdminClient, getSupabaseClient } from "../db/client";
import { AppError } from "../errors";
import { authMiddleware } from "../middleware/auth";
import { validateRequest } from "../middleware/validateRequest";
import { forgotPasswordSchema, loginSchema, refreshSchema, registerSchema } from "../schemas/auth";
import { createUserSettings } from "../services/userService";
import { config } from "../config";

export const authRoutes = Router();

function logDebug(payload: { location: string; message: string; data?: Record<string, unknown> }) {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/8f2b6680-c47c-4e5b-b9d7-488dc9e2d3be", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId: "debug-session",
      runId: "pre-fix",
      hypothesisId: "H1",
      location: payload.location,
      message: payload.message,
      data: payload.data,
      timestamp: Date.now()
    })
  }).catch(() => {});
  // #endregion
}


authRoutes.post("/register", validateRequest({ body: registerSchema }), async (req, res, next) => {
  try {
    logDebug({
      location: "routes/auth.ts:register",
      message: "register.start",
      data: { nodeEnv: config.nodeEnv }
    });
    const { email, password } = req.body as { email: string; password: string };
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signUp({ email, password });

    logDebug({
      location: "routes/auth.ts:register",
      message: "register.signup.result",
      data: {
        hasUser: !!data.user,
        hasSession: !!data.session,
        hasError: !!error,
        errorStatus: error?.status ?? null,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null
      }
    });

    if (error || !data.user) {
      if (error?.code === "over_email_send_rate_limit" && config.nodeEnv === "test") {
        logDebug({
          location: "routes/auth.ts:register",
          message: "register.fallback.adminCreateUser",
          data: { reason: error.code }
        });
        const admin = getSupabaseAdminClient();
        const { data: created, error: createError } = await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true
        });

        logDebug({
          location: "routes/auth.ts:register",
          message: "register.fallback.createUser.result",
          data: {
            hasUser: !!created?.user,
            hasError: !!createError,
            errorCode: createError?.code ?? null,
            errorStatus: createError?.status ?? null
          }
        });

        if (createError || !created.user) {
          return next(
            AppError.internal(createError?.message ?? "Failed to create user in test mode")
          );
        }

        await createUserSettings(created.user.id);

        const signIn = await client.auth.signInWithPassword({ email, password });
        logDebug({
          location: "routes/auth.ts:register",
          message: "register.fallback.signIn.result",
          data: {
            hasSession: !!signIn.data.session,
            hasError: !!signIn.error,
            errorStatus: signIn.error?.status ?? null
          }
        });
        if (signIn.error || !signIn.data.session) {
          return next(AppError.internal("Failed to create session in test mode"));
        }

        return res.status(201).json({
          success: true,
          data: {
            user: created.user,
            session: signIn.data.session
          }
        });
      }

      return next(
        AppError.validationError("Registration failed", {
          message: error?.message ?? "Unable to register user"
        })
      );
    }

    await createUserSettings(data.user.id);

    return res.status(201).json({
      success: true,
      data: {
        user: data.user,
        session: data.session
      }
    });
  } catch (err) {
    return next(err as Error);
  }
});

authRoutes.post("/login", validateRequest({ body: loginSchema }), async (req, res, next) => {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const client = getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/8f2b6680-c47c-4e5b-b9d7-488dc9e2d3be", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: "debug-session",
        runId: "pre-fix",
        hypothesisId: "H8",
        location: "routes/auth.ts:login",
        message: "login.result",
        data: {
          hasSession: !!data?.session,
          hasUser: !!data?.user,
          hasError: !!error,
          errorStatus: error?.status ?? null,
          errorCode: error?.code ?? null
        },
        timestamp: Date.now()
      })
    }).catch(() => {});
    // #endregion

    if (error || !data.session || !data.user) {
      return next(AppError.unauthorized("Invalid email or password"));
    }

    if (data.user.app_metadata?.blocked) {
      return next(AppError.forbidden("User is blocked"));
    }

    return res.status(200).json({
      success: true,
      data: {
        user: data.user,
        session: data.session
      }
    });
  } catch (err) {
    return next(err as Error);
  }
});

authRoutes.post("/logout", authMiddleware, async (req, res, next) => {
  try {
    logDebug({
      location: "routes/auth.ts:logout",
      message: "logout.start",
      data: { hasUserId: !!req.userId }
    });
    if (!req.userId || !req.accessToken) {
      return next(AppError.unauthorized("Missing user context"));
    }

    const admin = getSupabaseAdminClient();
    const { error } = await admin.auth.admin.signOut(req.accessToken);
    logDebug({
      location: "routes/auth.ts:logout",
      message: "logout.signout.result",
      data: {
        hasError: !!error,
        errorStatus: error?.status ?? null,
        errorCode: error?.code ?? null,
        errorMessage: error?.message ?? null
      }
    });
    if (error) {
      return next(AppError.internal("Failed to sign out user"));
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return next(err as Error);
  }
});

authRoutes.post("/refresh", validateRequest({ body: refreshSchema }), async (req, res, next) => {
  try {
    const { refreshToken } = req.body as { refreshToken: string };
    const client = getSupabaseClient();
    const { data, error } = await client.auth.refreshSession({
      refresh_token: refreshToken
    });

    if (error || !data.session) {
      return next(AppError.unauthorized("Invalid refresh token"));
    }

    return res.status(200).json({
      success: true,
      data: {
        session: data.session
      }
    });
  } catch (err) {
    return next(err as Error);
  }
});

authRoutes.post(
  "/forgot-password",
  validateRequest({ body: forgotPasswordSchema }),
  async (req, res, next) => {
    try {
      const { email } = req.body as { email: string };
      const client = getSupabaseClient();
      const { error } = await client.auth.resetPasswordForEmail(email);

      if (error) {
        return next(AppError.internal("Failed to trigger password reset"));
      }

      return res.status(200).json({
        success: true,
        data: {
          message: "If this email exists, a reset link has been sent."
        }
      });
    } catch (err) {
      return next(err as Error);
    }
  }
);
