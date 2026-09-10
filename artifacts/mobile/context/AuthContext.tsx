import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, clearToken, getToken, saveToken, type LoginCredentials, type Profile } from "@/lib/api";
import { registerForPushNotifications } from "@/lib/notifications";
import { isBiometricAvailable, isBiometricEnabled, authenticateWithBiometrics } from "@/lib/biometrics";
import { useEHR } from "@/context/EHRContext";
import {
  beginSecureSession,
  clearSecureSession,
  getSecureItem,
  setSecureItem,
} from "@/lib/secureStorage";
import {
  assertSession,
  clearSessionMetadata,
  createSession,
  getServerExpiry,
  restoreSession,
  subscribeToSessionEnd,
  type SessionEndReason,
} from "@/lib/session";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: Profile | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  sessionEndReason: SessionEndReason | null;
  sessionError: string | null;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PUSH_TOKEN_KEY = "carnet_push_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [sessionEndReason, setSessionEndReason] = useState<SessionEndReason | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const { adapter, isLoading: isEHRLoading } = useEHR();
  const queryClient = useQueryClient();
  const operation = useRef(0);
  const termination = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!isEHRLoading) checkAuth();
  }, [isEHRLoading]);

  const registerPush = async () => {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        const prev = await getSecureItem(PUSH_TOKEN_KEY);
        if (prev !== token) {
          await setSecureItem(PUSH_TOKEN_KEY, token);
        }
      }
    } catch {}
  };

  const terminate = useCallback(async (reason: SessionEndReason) => {
    if (termination.current) return termination.current;
    operation.current += 1;
    setIsAuthenticated(false);
    setIsLoading(true);
    setProfile(null);
    setSessionEndReason(reason === "logout" ? null : reason);
    setSessionError(null);
    api.clearCsrfToken();
    api.adapter?.clearToken();
    // Both calls invalidate their in-memory state synchronously, before any await.
    const metadataClear = clearSessionMetadata();
    const phiClear = clearSecureSession();
    const work = (async () => {
      try {
        await queryClient.cancelQueries();
        queryClient.clear();
        await Promise.all([
          clearToken(),
          metadataClear,
          phiClear,
          AsyncStorage.removeItem(PUSH_TOKEN_KEY),
        ]);
      } catch (error) {
        setSessionError(error instanceof Error ? error.message : "Secure local data cleanup failed.");
        throw error;
      } finally {
        setIsLoading(false);
        termination.current = null;
      }
    })();
    termination.current = work;
    return work;
  }, [queryClient]);

  useEffect(() => subscribeToSessionEnd((reason) => {
    void terminate(reason).catch(() => {});
  }), [terminate]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const timer = setInterval(() => {
      try {
        assertSession(adapter?.sessionKey ?? null);
      } catch {}
    }, 1000);
    return () => clearInterval(timer);
  }, [adapter?.sessionKey, isAuthenticated]);

  const checkAuth = async () => {
    const id = ++operation.current;
    try {
      const token = await getToken();
      if (id !== operation.current) return;
      if (token) {
        const metadata = await restoreSession(adapter?.sessionKey ?? null);
        if (id !== operation.current) return;
        if (!metadata) throw new Error("Invalid saved session");
        const bioOn = await isBiometricEnabled();
        if (id !== operation.current) return;

        if (bioOn) {
          const bioAvail = await isBiometricAvailable();
          if (id !== operation.current) return;
          if (!bioAvail) {
            await terminate("invalid");
            return;
          }
          try {
            const success = await authenticateWithBiometrics();
            if (id !== operation.current) return;
            if (!success) {
              await terminate("invalid");
              return;
            }
          } catch {
            await terminate("invalid");
            return;
          }
        }

        if (id !== operation.current) return;
        await beginSecureSession();
        if (id !== operation.current) {
          await clearSecureSession();
          return;
        }
        if (adapter) adapter.setToken(token);
        const p = await api.getProfile();
        if (id !== operation.current) return;
        setProfile(p);
        setIsAuthenticated(true);
        registerPush();
      } else {
        await terminate("logout");
      }
    } catch {
      if (id === operation.current) await terminate("invalid");
    } finally {
      if (id === operation.current) setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    if (termination.current) await termination.current;
    if (sessionError) throw new Error("Secure cleanup must succeed before another sign in.");
    const id = ++operation.current;
    setIsLoading(true);
    setSessionEndReason(null);
    const loginAdapter = api.adapter;
    try {
      const response = await api.login(credentials);
      if (id !== operation.current || api.adapter !== loginAdapter) {
        throw new Error("The selected provider changed during sign in. Please try again.");
      }
      await beginSecureSession();
      if (id !== operation.current || api.adapter !== loginAdapter) {
        await clearSecureSession();
        throw new Error("Sign in was cancelled.");
      }
      await saveToken(response.token);
      if (id !== operation.current || api.adapter !== loginAdapter) throw new Error("Sign in was cancelled.");
      await createSession(adapter?.sessionKey ?? null, getServerExpiry(response));
      if (id !== operation.current || api.adapter !== loginAdapter) throw new Error("Sign in was cancelled.");
      if (adapter) adapter.setLoginContext(response);
      const p = await api.getProfile();
      if (id !== operation.current) throw new Error("Sign in was cancelled.");
      setProfile(p);
      setIsAuthenticated(true);
      setIsLoading(false);
    } catch (error) {
      if (id === operation.current) await terminate("invalid");
      throw error;
    }
    registerPush();
  };

  const logout = async () => {
    await terminate("logout");
  };

  const refreshProfile = async () => {
    try {
      const p = await api.getProfile();
      setProfile(p);
    } catch (error) {
      await terminate("invalid");
      throw error;
    }
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, profile, login, logout, refreshProfile, sessionEndReason, sessionError }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
