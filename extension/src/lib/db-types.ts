/**
 * Minimal database types — the slice of the TarakkiHub schema the extension
 * actually touches (profiles, usage, credit_events, plans, autofill_profiles,
 * fill_events + the credit / autofill RPCs).
 * Kept in lockstep with `supabase/migrations/0001_init.sql`, `0002_admin.sql` and
 * `0003_autofill.sql` in the web app repo. If the schema changes, update this.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "user" | "admin";
          plan: string;
          status: "active" | "blocked";
          created_at: string;
        };
        Insert: { id: string };
        Update: { full_name?: string | null };
        Relationships: [];
      };
      usage: {
        Row: {
          id: string;
          user_id: string;
          credits_remaining: number;
          images_used: number;
          period_start: string;
          period_end: string;
        };
        Insert: { user_id: string };
        Update: { credits_remaining?: number; images_used?: number };
        Relationships: [];
      };
      credit_events: {
        Row: {
          id: string;
          user_id: string;
          action: string;
          credits: number;
          created_at: string;
        };
        Insert: { user_id: string; action?: string; credits?: number };
        Update: { action?: string };
        Relationships: [];
      };
      plans: {
        Row: {
          id: string;
          name: string;
          price_placeholder: string | null;
          price_amount: number | null;
          monthly_credits: number;
          is_active: boolean;
          limits: Json;
          features: Json;
          sort_order: number;
        };
        Insert: { name: string };
        Update: { name?: string };
        Relationships: [];
      };
      /**
       * One saved Meesho catalog form. RLS requires has_active_plan(), so a free
       * or expired account simply gets no rows — see 0003_autofill.sql.
       * `fields` holds a CapturedField[] (lib/autofill-types.ts).
       */
      autofill_profiles: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category_path: string | null;
          fields: Json;
          field_count: number;
          used_count: number;
          last_used_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          name: string;
          category_path?: string | null;
          fields?: Json;
          field_count?: number;
        };
        Update: {
          name?: string;
          category_path?: string | null;
          fields?: Json;
          field_count?: number;
        };
        Relationships: [];
      };
      /** One row per autofill run. Written via record_fill_event(). */
      fill_events: {
        Row: {
          id: string;
          user_id: string;
          profile_id: string | null;
          filled_count: number;
          skipped_count: number;
          failed_count: number;
          created_at: string;
        };
        Insert: {
          user_id: string;
          profile_id?: string | null;
          filled_count?: number;
          skipped_count?: number;
          failed_count?: number;
        };
        Update: { filled_count?: number };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      consume_credit: {
        Args: { p_action?: string; p_amount?: number };
        Returns: Database["public"]["Tables"]["usage"]["Row"];
      };
      starter_credits: {
        Args: Record<string, never>;
        Returns: number;
      };
      /** The autofill gate. Defaults to auth.uid() when called with no args. */
      has_active_plan: {
        Args: { uid?: string };
        Returns: boolean;
      };
      /** NULL = unlimited. Read from the plan's `limits` jsonb. */
      autofill_profile_limit: {
        Args: { uid?: string };
        Returns: number | null;
      };
      /** Logs a fill_events row and bumps used_count / last_used_at atomically. */
      record_fill_event: {
        Args: {
          p_profile_id: string;
          p_filled?: number;
          p_skipped?: number;
          p_failed?: number;
        };
        Returns: Database["public"]["Tables"]["autofill_profiles"]["Row"];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Usage = Database["public"]["Tables"]["usage"]["Row"];
export type CreditEvent = Database["public"]["Tables"]["credit_events"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type AutofillProfileRow =
  Database["public"]["Tables"]["autofill_profiles"]["Row"];
export type FillEvent = Database["public"]["Tables"]["fill_events"]["Row"];
