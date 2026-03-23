import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, clearToken, getToken, saveToken, type LoginCredentials, type Profile } from "@/lib/api";
import { registerForPushNotifications } from "@/lib/notifications";
import { isBiometricAvailable, isBiometricEnabled, authenticateWithBiometrics } from "@/lib/biometrics";

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  profile: Profile | null;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PUSH_TOKEN_KEY = "carnet_push_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const registerPush = async () => {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        const prev = await AsyncStorage.getItem(PUSH_TOKEN_KEY);
        if (prev !== token) {
          await AsyncStorage.setItem(PUSH_TOKEN_KEY, token);
        }
      }
    } catch {}
  };

  const checkAuth = async () => {
    try {
      const token = await getToken();
      if (token) {
        const bioAvail = await isBiometricAvailable();
        const bioOn = await isBiometricEnabled();
        if (bioAvail && bioOn) {
          const success = await authenticateWithBiometrics();
          if (!success) {
            setIsLoading(false);
            return;
          }
        }
        setIsAuthenticated(true);
        try {
          const p = await api.getProfile();
          setProfile(p);
        } catch {}
        registerPush();
      }
    } catch {
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (credentials: LoginCredentials) => {
    const response = await api.login(credentials);
    await saveToken(response.token);
    setIsAuthenticated(true);
    try {
      const p = await api.getProfile();
      setProfile(p);
    } catch {}
    registerPush();
  };

  const logout = async () => {
    await clearToken();
    await AsyncStorage.removeItem(PUSH_TOKEN_KEY);
    setIsAuthenticated(false);
    setProfile(null);
  };

  const refreshProfile = async () => {
    try {
      const p = await api.getProfile();
      setProfile(p);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, profile, login, logout, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
