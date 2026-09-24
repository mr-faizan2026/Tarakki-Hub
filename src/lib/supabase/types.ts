/**
 * Hand-authored database types, kept in lockstep with
 * `supabase/migrations/0001_init.sql`. If you change the schema, update this.
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

/** Listing fields stored on a template (all optional, free-form seller data). */
export type TemplateFields = {
  productName?: string;
  brand?: string;
  hsn?: string;
  gst?: string;
  material?: string;
  colour?: string;
  size?: string;
  pattern?: string;
  fit?: string;
  description?: string;
  keywords?: string;
  mrp?: string;
  sellingPrice?: string;
  [key: string]: string | undefined;
};

/** One image attached to a template (points at a Storage object). */
export type TemplateImage = {
  path: string;
  name: string;
  width?: number;
  height?: number;
};

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
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "user" | "admin";
          plan?: string;
          status?: "active" | "blocked";
          created_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          role?: "user" | "admin";
          plan?: string;
          status?: "active" | "blocked";
          created_at?: string;
        };
        Relationships: [];
      };
      templates: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          category: string | null;
          fields: TemplateFields;
          images: TemplateImage[];
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name?: string;
          category?: string | null;
          fields?: TemplateFields;
          images?: TemplateImage[];
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          category?: string | null;
          fields?: TemplateFields;
          images?: TemplateImage[];
          created_at?: string;
          updated_at?: string;
        };
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
        Insert: {
          id?: string;
          user_id: string;
          credits_remaining?: number;
          images_used?: number;
          period_start?: string;
          period_end?: string;
        };
        Update: {
          credits_remaining?: number;
          images_used?: number;
          period_start?: string;
          period_end?: string;
        };
        Relationships: [];
      };
      image_exports: {
        Row: { id: string; user_id: string; created_at: string };
        Insert: { id?: string; user_id: string; created_at?: string };
        Update: { created_at?: string };
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
        Insert: {
          id?: string;
          user_id: string;
          action?: string;
          credits?: number;
          created_at?: string;
        };
        Update: {
          action?: string;
          credits?: number;
          created_at?: string;
        };
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
        Insert: {
          id?: string;
          name: string;
          price_placeholder?: string | null;
          price_amount?: number | null;
          monthly_credits?: number;
          is_active?: boolean;
          limits?: Json;
          features?: Json;
          sort_order?: number;
        };
        Update: {
          name?: string;
          price_placeholder?: string | null;
          price_amount?: number | null;
          monthly_credits?: number;
          is_active?: boolean;
          limits?: Json;
          features?: Json;
          sort_order?: number;
        };
        Relationships: [];
      };
      subscriptions: {
        Row: {
          id: string;
          user_id: string;
          plan: string;
          status: "active" | "expired" | "cancelled";
          started_at: string;
          renewal_at: string | null;
          provider: string | null;
          provider_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          plan?: string;
          status?: "active" | "expired" | "cancelled";
          started_at?: string;
          renewal_at?: string | null;
          provider?: string | null;
          provider_ref?: string | null;
          created_at?: string;
        };
        Update: {
          plan?: string;
          status?: "active" | "expired" | "cancelled";
          started_at?: string;
          renewal_at?: string | null;
          provider?: string | null;
          provider_ref?: string | null;
        };
        Relationships: [];
      };
      payments: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          currency: string;
          plan: string | null;
          status: "pending" | "success" | "failed" | "refunded";
          provider: string | null;
          provider_ref: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount?: number;
          currency?: string;
          plan?: string | null;
          status?: "pending" | "success" | "failed" | "refunded";
          provider?: string | null;
          provider_ref?: string | null;
          created_at?: string;
        };
        Update: {
          amount?: number;
          currency?: string;
          plan?: string | null;
          status?: "pending" | "success" | "failed" | "refunded";
          provider?: string | null;
          provider_ref?: string | null;
        };
        Relationships: [];
      };
      app_settings: {
        Row: { key: string; value: Json; updated_at: string };
        Insert: { key: string; value: Json; updated_at?: string };
        Update: { value?: Json; updated_at?: string };
        Relationships: [];
      };
      admin_actions: {
        Row: {
          id: string;
          admin_id: string | null;
          admin_email: string | null;
          action: string;
          target_user_id: string | null;
          detail: Json;
          created_at: string;
        };
        Insert: {
          id?: string;
          admin_id?: string | null;
          admin_email?: string | null;
          action: string;
          target_user_id?: string | null;
          detail?: Json;
          created_at?: string;
        };
        Update: {
          detail?: Json;
        };
        Relationships: [];
      };
    };
    Views: {
      admin_users: {
        Row: {
          id: string;
          full_name: string | null;
          role: "user" | "admin";
          plan: string;
          status: "active" | "blocked";
          email: string | null;
          created_at: string;
          last_sign_in_at: string | null;
          credits_remaining: number;
          images_used: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      consume_export_credit: {
        Args: Record<string, never>;
        Returns: Database["public"]["Tables"]["usage"]["Row"];
      };
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
export type Template = Database["public"]["Tables"]["templates"]["Row"];
export type Usage = Database["public"]["Tables"]["usage"]["Row"];
export type ImageExport = Database["public"]["Tables"]["image_exports"]["Row"];
export type CreditEvent = Database["public"]["Tables"]["credit_events"]["Row"];
export type Plan = Database["public"]["Tables"]["plans"]["Row"];
export type Subscription = Database["public"]["Tables"]["subscriptions"]["Row"];
export type Payment = Database["public"]["Tables"]["payments"]["Row"];
export type AdminAction = Database["public"]["Tables"]["admin_actions"]["Row"];
export type AdminUserRow = Database["public"]["Views"]["admin_users"]["Row"];
