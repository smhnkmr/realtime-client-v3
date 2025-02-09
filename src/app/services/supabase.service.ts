import { Injectable } from '@angular/core';
import { createClient, SupabaseClient, User, AuthError } from '@supabase/supabase-js';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { catchError, retry } from 'rxjs/operators';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private supabase: SupabaseClient = createClient(
    environment.supabaseUrl,
    environment.supabaseKey,
    {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false
      },
      db: {
        schema: 'public'
      },
      global: {
        headers: {
          'x-my-custom-header': 'my-app-name'
        }
      }
    }
  );
  private userSubject = new BehaviorSubject<User | null>(null);
  user$ = this.userSubject.asObservable();
  private initialized = false;

  constructor(private router: Router) {
    this.initializeSupabase();
  }

  private initializeSupabase() {
    try {
      if (this.initialized) return;

      // Set up auth state listener
      this.supabase.auth.onAuthStateChange((event, session) => {
        this.userSubject.next(session?.user ?? null);
      });

      // Check current session
      this.checkSession();
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize Supabase:', error);
      this.initialized = false;
    }
  }

  private async checkSession() {
    try {
      const { data: { session }, error } = await this.supabase.auth.getSession();
      if (error) throw error;
      this.userSubject.next(session?.user ?? null);
    } catch (error) {
      console.error('Error checking session:', error);
      this.userSubject.next(null);
    }
  }

  async signUp(email: string, password: string, fullName: string) {
    try {
      if (!this.initialized) {
        this.initializeSupabase();
      }

      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName
          }
        }
      });

      if (error) throw error;
      
      if (data.user) {
        await this.router.navigate(['/dashboard']);
      }
      return { data, error: null };
    } catch (error) {
      console.error('Sign up error:', error);
      return { data: null, error: error as AuthError };
    }
  }

  async signIn(email: string, password: string) {
    try {
      if (!this.initialized) {
        this.initializeSupabase();
      }

      const { data, error } = await this.supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      
      if (data.user) {
        await this.router.navigate(['/dashboard']);
      }
      return { data, error: null };
    } catch (error) {
      console.error('Sign in error:', error);
      return { data: null, error: error as AuthError };
    }
  }

  async signOut() {
    try {
      if (!this.initialized) {
        this.initializeSupabase();
      }

      const { error } = await this.supabase.auth.signOut();
      if (error) throw error;
      
      this.userSubject.next(null);
      await this.router.navigate(['/']);
      return { error: null };
    } catch (error) {
      console.error('Sign out error:', error);
      return { error: error as AuthError };
    }
  }

  // Helper method to check if Supabase is initialized
  private ensureInitialized() {
    if (!this.initialized) {
      this.initializeSupabase();
    }
    return this.initialized;
  }
}