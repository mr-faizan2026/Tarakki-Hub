/**
 * Minimal database types — the slice of the TarakkiHub schema the extension
 * actually touches (profiles, usage, credit_events, plans + the credit RPC).
 * Kept in lockstep with `supabase/migrations/0001_init.sql` and `0002_admin.sql`
 * in the web app repo. If the schema changes, update this.
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
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Usage = Database["public"]["Tables"]["usage"]["Row"];
export type CreditEvent = Database["public"]["Tables"]["credit_events"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
