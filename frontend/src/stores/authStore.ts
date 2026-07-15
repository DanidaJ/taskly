import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { AuthState, User } from '@/types';
import { supabase } from '@/services/supabase';

interface AuthStore extends AuthState {
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (
    email: string,
    password: string,
    fullName?: string,
  ) => Promise<{ needsEmailConfirmation: boolean; alreadyRegistered: boolean }>;
  resendConfirmation: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
  updateUser: (updates: Partial<User>) => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      isLoading: false,
      isAuthenticated: false,

      initialize: async () => {
        set({ isLoading: true });
        try {
          // First check if we have a persisted session
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              
              if (user) {
                set({
                  user: {
                    id: user.id,
                    email: user.email || '',
                    full_name: user.user_metadata?.full_name,
                    avatar_url: user.user_metadata?.avatar_url,
                    created_at: user.created_at,
                    updated_at: user.updated_at || user.created_at,
                  },
                  session: {
                    access_token: session.access_token,
                    refresh_token: session.refresh_token,
                  },
                  isAuthenticated: true,
                  isLoading: false,
                });
              } else {
                set({ isLoading: false });
              }
            } catch (error) {
              console.error('Failed to get user:', error);
              set({ isLoading: false });
            }
          } else {
            // Only clear auth if there's no session
            set({ isLoading: false });
          }

          // Listen for auth changes - but only update on explicit sign out
          supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === 'SIGNED_IN' && session) {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                set({
                  user: user ? {
                    id: user.id,
                    email: user.email || '',
                    full_name: user.user_metadata?.full_name,
                    avatar_url: user.user_metadata?.avatar_url,
                    created_at: user.created_at,
                    updated_at: user.updated_at || user.created_at,
                  } : null,
                  session: {
                    access_token: session.access_token,
                    refresh_token: session.refresh_token,
                  },
                  isAuthenticated: true,
                  isLoading: false,
                });
              } catch (error) {
                console.error('Failed to get user on sign in:', error);
              }
            } else if (event === 'SIGNED_OUT') {
              // Only clear on explicit sign out
              set({
                user: null,
                session: null,
                isAuthenticated: false,
                isLoading: false,
              });
            }
          });
        } catch (error) {
          console.error('Auth initialization error:', error);
          set({ isLoading: false });
        }
      },

      signIn: async (email: string, password: string) => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;
          
          // Update state immediately
          if (data.session && data.user) {
            set({
              user: {
                id: data.user.id,
                email: data.user.email || '',
                full_name: data.user.user_metadata?.full_name,
                avatar_url: data.user.user_metadata?.avatar_url,
                created_at: data.user.created_at,
                updated_at: data.user.updated_at || data.user.created_at,
              },
              session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              },
              isAuthenticated: true,
              isLoading: false,
            });
          }
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      signUp: async (email: string, password: string, fullName?: string) => {
        set({ isLoading: true });
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: {
                full_name: fullName,
              },
            },
          });
          if (error) throw error;

          // Anti-enumeration: when the email already exists, Supabase returns a
          // user with an EMPTY identities array and no session/error (so bad
          // actors can't probe which emails are registered). Detect it so we can
          // steer the user to sign in instead of showing a bogus "check email".
          const alreadyRegistered =
            !!data.user &&
            Array.isArray(data.user.identities) &&
            data.user.identities.length === 0;

          // A session is only returned when email confirmation is OFF — in that
          // case the user is signed in immediately.
          if (data.session && data.user && !alreadyRegistered) {
            set({
              user: {
                id: data.user.id,
                email: data.user.email || '',
                full_name: fullName,
                avatar_url: data.user.user_metadata?.avatar_url,
                created_at: data.user.created_at,
                updated_at: data.user.updated_at || data.user.created_at,
              },
              session: {
                access_token: data.session.access_token,
                refresh_token: data.session.refresh_token,
              },
              isAuthenticated: true,
              isLoading: false,
            });
            return { needsEmailConfirmation: false, alreadyRegistered: false };
          }

          set({ isLoading: false });
          return { needsEmailConfirmation: !alreadyRegistered, alreadyRegistered };
        } catch (error) {
          set({ isLoading: false });
          throw error;
        }
      },

      resendConfirmation: async (email: string) => {
        // No emailRedirectTo — use the project's existing Site URL config, which
        // is what the (already working) confirmation emails use.
        const { error } = await supabase.auth.resend({ type: 'signup', email });
        if (error) throw error;
      },

      signOut: async () => {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
        set({
          user: null,
          session: null,
          isAuthenticated: false,
        });
      },

      updateUser: (updates: Partial<User>) => {
        const currentUser = get().user;
        if (currentUser) {
          set({
            user: { ...currentUser, ...updates },
          });
        }
      },
    }),
    {
      name: 'taskly-auth',
      partialize: (state) => ({
        user: state.user,
        session: state.session,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
