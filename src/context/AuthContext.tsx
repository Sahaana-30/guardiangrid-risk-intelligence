import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { clearOfflineSOSQueue, setAuthTokenProvider } from '../services/emergencyApi';
import { clearFieldKitLocalStorage } from '../services/fieldKitResilience';
import { getActiveOrganizationId } from '../services/tenantScope';
import { apiUrl, getApiCredentials } from '../services/apiBase';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const userRef = useRef<User | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (nextUser) => {
      userRef.current = nextUser;
      setUser(nextUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getIdToken = useCallback(async (): Promise<string | null> => {
    const current = userRef.current;
    if (!current) return null;
    try {
      return await current.getIdToken();
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    setAuthTokenProvider(getIdToken);
    return () => setAuthTokenProvider(null);
  }, [getIdToken]);

  const signInWithGoogle = useCallback(async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleAuthProvider);
    } catch (err: any) {
      if (err?.code !== 'auth/popup-closed-by-user') {
        setError(err?.message || 'Sign-in failed. Please try again.');
      }
    }
  }, []);

  const signOut = useCallback(async () => {
    setError(null);
    try {
      let idToken: string | null = null;
      if (userRef.current) {
        try {
          idToken = await userRef.current.getIdToken();
        } catch {
          idToken = null;
        }
      }

      const savedOperatorId =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('gg_nexconn_operator_id')
          : null;

      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('gg-auth-logout'));
      }

      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId =
        controller && typeof window !== 'undefined'
          ? window.setTimeout(() => controller.abort(), 2500)
          : null;

      try {
        await fetch(apiUrl('/api/nexconn/logout'), {
          method: 'POST',
          credentials: getApiCredentials(),
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'x-gg-org-id': getActiveOrganizationId(),
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ operatorId: savedOperatorId || undefined }),
          ...(controller ? { signal: controller.signal } : {}),
        });
      } catch {
        // Non-blocking: local teardown & Firebase sign-out always proceed
      } finally {
        if (timeoutId !== null && typeof window !== 'undefined') {
          window.clearTimeout(timeoutId);
        }
      }

      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('gg_nexconn_operator_id');
      }
      clearFieldKitLocalStorage();
      clearOfflineSOSQueue();
      await firebaseSignOut(auth);
    } catch (err: any) {
      setError(err?.message || 'Sign-out failed.');
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOut, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
