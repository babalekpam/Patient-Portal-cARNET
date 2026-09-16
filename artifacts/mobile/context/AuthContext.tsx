import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  api,
  clearToken,
  getToken,
  saveToken,
  type LoginCredentials,
  type Profile,
} from "@/lib/api";
import { registerForPushNotifications } from "@/lib/notifications";
import { isBiometricAvailable, isBiometricEnabled, authenticateWithBiometrics } from "@/lib/biometrics";
import { useEHR } from "@/context/EHRContext";
import {
  beginSecureSession,
  clearSecureSession,
  getSecureItem,
  isSecureStorageQuarantined,
  quarantineSecureStorage,
  setSecureItem,
  subscribeToSecureStorageQuarantine,
} from "@/lib/secureStorage";
import { AsyncOperationTimeoutError, isAsyncOperationTimeout, withTimeout } from "@/lib/async";
import { syncOptionalPushToken } from "@/lib/optionalPush";
import { beginProtectedSessionTermination } from "@/lib/sessionBoundary";
import { isNavimediNativeApiOverrideActive } from "@/lib/ehr/navimediConfig";
import {
  assertSession,
  clearSessionMetadata,
  createSession,
  getServerExpiry,
  hasCurrentSession,
  invalidateSessionBoundary,
  restoreSession,
  sessionGeneration,
  subscribeToSessionEnd,
  type SessionEndReason,
} from "@/lib/session";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  isBootstrapping: boolean;
  profile: Profile | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<Profile | null>;
  sessionEndReason: SessionEndReason | null;
  sessionError: string | null;
  startupError: string | null;
  retryStartup: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PUSH_TOKEN_KEY = "carnet_push_token";
const STORAGE_TIMEOUT_MS = 8_000;
const BIOMETRIC_TIMEOUT_MS = 15_000;
const PROFILE_TIMEOUT_MS = 15_000;
const CLEANUP_NOTICE_MS = 8_000;

function isExpectedRestoreFailure(error: unknown): boolean {
  return error instanceof Error && /Invalid saved session|biometric|authentication was cancelled/i.test(error.message);
}

function startupErrorMessage(error: unknown): string {
  if (error instanceof AsyncOperationTimeoutError) {
    return "Secure startup is taking longer than expected. Retry when device storage or authentication is available.";
  }
  return "CARNET could not verify the saved session. Retry to continue securely.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionEndReason, setSessionEndReason] = useState<SessionEndReason | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const { adapter, isLoading: isEHRLoading, error: ehrError, retry: retryEHR } = useEHR();
  const queryClient = useQueryClient();
  const operation = useRef(0);
  const termination = useRef<Promise<void> | null>(null);
  const bootstrapGeneration = useRef(0);
  const bootstrapStarted = useRef(false);

  const terminate = useCallback(async (reason: SessionEndReason) => {
    if (termination.current) return termination.current;
    const capturedGeneration = sessionGeneration();
    const capturedAdapter = api.adapter;
    operation.current += 1;
    // A logout is a local security boundary immediately, not after the
    // best-effort remote revocation. Conceal the protected tree, invalidate
    // history pages, and bump the in-memory generation while retaining only
    // the captured bearer for api.logout.
    setIsAuthenticated(false);
    setIsLoading(true);
    setProfile(null);
    setSessionEndReason(reason === "logout" ? null : reason);
    setSessionError(null);
    beginProtectedSessionTermination(queryClient, invalidateSessionBoundary);

    // A replacement session is never allowed to be erased by an older logout.
    // The in-memory boundary above changes the generation before remote
    // revocation starts, so this guard protects any newer session.
    const ownsCapturedSession = () =>
      sessionGeneration() === capturedGeneration ||
      !hasCurrentSession();

    let cleanupNoticeTimer: ReturnType<typeof setTimeout> | undefined;
    let cleanupSucceeded = false;
    const work = (async () => {
      try {
        // Keep the captured bearer in memory until the server-bound logout
        // completes. A network failure is deliberately non-fatal: local
        // cleanup still runs in finally.
        if (reason === "logout") {
          try {
            await api.logout(capturedAdapter);
          } catch {
            // The server may be unreachable. Never retain local patient data
            // solely because revocation could not be delivered.
          }
        }
        if (!ownsCapturedSession()) return;

        const metadataClear = clearSessionMetadata();
        setIsAuthenticated(false);
        setIsLoading(true);
        setProfile(null);
        setSessionEndReason(reason === "logout" ? null : reason);
        setSessionError(null);

        // Release the captured bearer only after best-effort remote revocation;
        // the protected tree and history generation were already invalidated.
        api.clearCsrfToken();
        capturedAdapter?.clearToken();
        const phiClear = clearSecureSession();
        cleanupNoticeTimer = setTimeout(() => {
          if (termination.current === work) {
            setSessionError("Secure local data cleanup is taking longer than expected. Keep the app open and retry.");
          }
        }, CLEANUP_NOTICE_MS);
        await queryClient.cancelQueries();
        queryClient.clear();
        await Promise.all([
          clearToken(),
          metadataClear,
          phiClear,
          AsyncStorage.removeItem(PUSH_TOKEN_KEY),
        ]);
        cleanupSucceeded = true;
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : "Secure local data cleanup failed.");
        throw error;
      } finally {
        if (cleanupNoticeTimer) clearTimeout(cleanupNoticeTimer);
        if (cleanupSucceeded) setSessionError(null);
        if (ownsCapturedSession()) setIsLoading(false);
        termination.current = null;
      }
    })();
    termination.current = work;
    return work;
  }, [queryClient]);

  const registerPush = useCallback(async (operationId: number) => {
    const result = await syncOptionalPushToken(
      registerForPushNotifications,
      () => getSecureItem(PUSH_TOKEN_KEY),
      (token) => setSecureItem(PUSH_TOKEN_KEY, token),
      PROFILE_TIMEOUT_MS,
      STORAGE_TIMEOUT_MS,
    );
    if (operationId !== operation.current) return;
    if (result === "storage-failed") {
      quarantineSecureStorage();
      const cleanup = terminate("invalid");
      void cleanup.catch(() => {});
    }
  }, [terminate]);

  const checkAuth = useCallback(async () => {
    const bootstrapId = ++bootstrapGeneration.current;
    const id = ++operation.current;
    setIsBootstrapping(true);
    setIsLoading(true);
    setStartupError(null);
    if (termination.current) {
      try {
        await termination.current;
      } catch {
        if (bootstrapId === bootstrapGeneration.current) {
          setIsBootstrapping(false);
          setIsLoading(false);
        }
        return;
      }
    }

    try {
      const token = await withTimeout(getToken(), STORAGE_TIMEOUT_MS, "Saved credential loading");
      if (id !== operation.current) return;
      if (token) {
        // A direct NaviMED session has no provider-specific session key. Never
        // send a bearer saved under the production direct endpoint to a
        // development-only native override; require a fresh sign in instead.
        if (!adapter && isNavimediNativeApiOverrideActive()) {
          await terminate("invalid");
          return;
        }
        const metadata = await withTimeout(
          restoreSession(adapter?.sessionKey ?? null),
          STORAGE_TIMEOUT_MS,
          "Saved session loading",
        );
        if (id !== operation.current) return;
        if (!metadata) throw new Error("Invalid saved session");
        const bioOn = await withTimeout(
          isBiometricEnabled(),
          BIOMETRIC_TIMEOUT_MS,
          "Biometric preference loading",
        );
        if (id !== operation.current) return;

        if (bioOn) {
          const bioAvail = await withTimeout(
            isBiometricAvailable(),
            BIOMETRIC_TIMEOUT_MS,
            "Biometric availability check",
          );
          if (id !== operation.current) return;
          if (!bioAvail) {
            await terminate("invalid");
            return;
          }
          const success = await withTimeout(
            authenticateWithBiometrics(),
            BIOMETRIC_TIMEOUT_MS,
            "Biometric authentication",
          );
          if (id !== operation.current) return;
          if (!success) {
            await terminate("invalid");
            return;
          }
        }

        if (id !== operation.current) return;
        await withTimeout(beginSecureSession(), STORAGE_TIMEOUT_MS, "Secure session opening");
        if (id !== operation.current) {
          quarantineSecureStorage();
          return;
        }
        if (adapter) adapter.setToken(token);
        const p = await withTimeout(api.getProfile(), PROFILE_TIMEOUT_MS, "Saved profile loading");
        if (id !== operation.current || api.adapter !== adapter) return;
        setProfile(p);
        setIsAuthenticated(true);
        void registerPush(id);
      } else {
        await terminate("logout");
      }
    } catch (error) {
      if (id !== operation.current) return;
      if (isAsyncOperationTimeout(error) || isSecureStorageQuarantined()) {
        quarantineSecureStorage();
      }
      if (!isExpectedRestoreFailure(error)) setStartupError(startupErrorMessage(error));
      const cleanup = terminate("invalid");
      await cleanup.catch(() => {});
    } finally {
      if (bootstrapId === bootstrapGeneration.current) setIsBootstrapping(false);
      if (id === operation.current) setIsLoading(false);
    }
  }, [adapter, registerPush, terminate]);

  useEffect(() => subscribeToSessionEnd((reason) => {
    void terminate(reason).catch(() => {});
  }), [terminate]);

  useEffect(() => subscribeToSecureStorageQuarantine(() => {
    if (isAuthenticated) {
      void terminate("invalid").catch(() => {});
    }
  }), [isAuthenticated, terminate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => {
      try {
        assertSession(adapter?.sessionKey ?? null);
      } catch {}
    }, 1000);
    return () => clearInterval(timer);
  }, [adapter?.sessionKey, isAuthenticated]);

  const login = async (credentials: LoginCredentials) => {
    if (termination.current) {
      try {
        await termination.current;
      } catch {
        throw new Error("Secure cleanup must succeed before another sign in.");
      }
    }
    if (sessionError || isSecureStorageQuarantined()) {
      throw new Error("Secure cleanup must succeed before another sign in.");
    }
    const id = ++operation.current;
    setIsLoading(true);
    setSessionEndReason(null);
    const loginAdapter = api.adapter;
    let response: Awaited<ReturnType<typeof api.login>> | undefined;
    try {
      response = await withTimeout(api.login(credentials), PROFILE_TIMEOUT_MS, "Sign in");

      // NaviMED (and the direct NaviMED fallback) must prove the fresh,
      // bearer-bound profile before secure storage or session metadata is
      // touched. FHIR adapters intentionally keep their existing OAuth/FHIR
      // context flow and are not forced into the NaviMED response schema.
      let verifiedProfile: Profile | null = null;
      if (loginAdapter?.verifyLoginProfile || !loginAdapter) {
        verifiedProfile = await withTimeout(
          api.verifyLoginProfile(response, loginAdapter),
          PROFILE_TIMEOUT_MS,
          "Patient profile verification",
        );
      }

      if (id !== operation.current || api.adapter !== loginAdapter) {
        throw new Error("The selected provider changed during sign in. Please try again.");
      }
      await withTimeout(beginSecureSession(), STORAGE_TIMEOUT_MS, "Secure session opening");
      if (id !== operation.current || api.adapter !== loginAdapter) {
        quarantineSecureStorage();
        throw new Error("Sign in was cancelled.");
      }
      await withTimeout(saveToken(response.token), STORAGE_TIMEOUT_MS, "Credential storage");
      if (id !== operation.current || api.adapter !== loginAdapter) throw new Error("Sign in was cancelled.");
      await withTimeout(
        createSession(adapter?.sessionKey ?? null, getServerExpiry(response)),
        STORAGE_TIMEOUT_MS,
        "Session metadata storage",
      );
      if (id !== operation.current || api.adapter !== loginAdapter) throw new Error("Sign in was cancelled.");
      if (adapter) adapter.setLoginContext(response);
      const p = verifiedProfile ?? await withTimeout(api.getProfile(), PROFILE_TIMEOUT_MS, "Profile loading");
      if (id !== operation.current || api.adapter !== loginAdapter) throw new Error("Sign in was cancelled.");
      setProfile(p);
      setIsAuthenticated(true);
      setIsLoading(false);
    } catch (error) {
      if (response) {
        // This request uses only the captured token and cannot clear a
        // replacement session. It covers profile mismatches, stale
        // completions, storage failures and provider changes after issuance.
        await api.revokeToken(response.token, loginAdapter).catch(() => {});
      }
      if (id === operation.current) {
        if (isAsyncOperationTimeout(error) || isSecureStorageQuarantined()) {
          quarantineSecureStorage();
        }
        const cleanup = terminate("invalid");
        void cleanup.catch(() => {});
      }
      throw error;
    }
    void registerPush(id);
  };

  const logout = async () => {
    await terminate("logout");
  };

  const refreshProfile = async (): Promise<Profile | null> => {
    try {
      const requestId = operation.current;
      const p = await withTimeout(api.getProfile(), PROFILE_TIMEOUT_MS, "Profile refresh");
      if (requestId !== operation.current) return null;
      setProfile(p);
      return p;
    } catch (error) {
      const cleanup = terminate("invalid");
      void cleanup.catch(() => {});
      throw error;
    }
  };

  useEffect(() => {
    if (isEHRLoading) return;
    if (ehrError && !bootstrapStarted.current) {
      setStartupError(ehrError);
      setIsBootstrapping(true);
      setIsLoading(false);
      return;
    }
    if (!bootstrapStarted.current) {
      bootstrapStarted.current = true;
      void checkAuth();
    }
  }, [checkAuth, ehrError, isEHRLoading]);

  const retryStartup = useCallback(async () => {
    setStartupError(null);
    setIsBootstrapping(true);
    if (ehrError) {
      await retryEHR();
      return;
    }
    void checkAuth();
  }, [checkAuth, ehrError, retryEHR]);

  return (
    <AuthContext.Provider value={{
      isAuthenticated,
      isLoading,
      isBootstrapping,
      profile,
      login,
      logout,
      refreshProfile,
      sessionEndReason,
      sessionError,
      startupError,
      retryStartup,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
