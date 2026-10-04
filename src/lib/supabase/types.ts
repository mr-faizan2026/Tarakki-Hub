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
          /** 0005 — the 10-digit number Cashfree requires on every order. */
          phone: string | null;
          role: "user" | "admin";
          plan: string;
          status: "active" | "blocked";
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          phone?: string | null;
          role?: "user" | "admin";
          plan?: string;
          status?: "active" | "blocked";
          created_at?: string;
        };
        /**
         * 0005 revoked column UPDATE from `authenticated` on everything except
         * `full_name` and `phone`. The other fields are writable only through
         * the service role (the admin panel), so a client-side update naming
         * them will be rejected by the database however this type reads.
         */
        Update: {
          id?: string;
          full_name?: string | null;
          phone?: string | null;
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
          /** When the current credit balance lapses. Enforced at spend time. */
          period_start: string;
          period_end: string;
          /**
           * 0005 — when paid access ends, null for someone who has never
           * bought a pack. This is the autofill gate; `period_end` is not,
           * because free starter credits also carry an expiry.
           */
          paid_until: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          credits_remaining?: number;
          images_used?: number;
          period_start?: string;
          period_end?: string;
          paid_until?: string | null;
        };
        Update: {
          credits_remaining?: number;
          images_used?: number;
          period_start?: string;
          period_end?: string;
          paid_until?: string | null;
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
      /**
       * 0005 — what is for sale. The price lives HERE and is read server-side
       * at checkout; a checkout request names a slug and never an amount.
       */
      credit_packs: {
        Row: {
          id: string;
          slug: string;
          name: string;
          tagline: string | null;
          credits: number;
          /** GST-INCLUSIVE rupees — exactly what the buyer is charged. */
          price_inr: number;
          validity_days: number;
          features: Json;
          featured: boolean;
          active: boolean;
          sort_order: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          slug: string;
          name: string;
          tagline?: string | null;
          credits: number;
          price_inr: number;
          validity_days: number;
          features?: Json;
          featured?: boolean;
          active?: boolean;
          sort_order?: number;
          created_at?: string;
        };
        Update: {
          slug?: string;
          name?: string;
          tagline?: string | null;
          credits?: number;
          price_inr?: number;
          validity_days?: number;
          features?: Json;
          featured?: boolean;
          active?: boolean;
          sort_order?: number;
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
          /** The Cashfree order id. Unique per provider — see 0005. */
          provider_ref: string | null;
          /* ── 0005: what was bought, read from credit_packs at checkout ── */
          pack_slug: string | null;
          credits_granted: number | null;
          validity_days: number | null;
          /** The idempotency latch. Non-null once credits have been added. */
          granted_at: string | null;
          created_at: string;
          updated_at: string;
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
          pack_slug?: string | null;
          credits_granted?: number | null;
          validity_days?: number | null;
          granted_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          currency?: string;
          plan?: string | null;
          status?: "pending" | "success" | "failed" | "refunded";
          provider?: string | null;
          provider_ref?: string | null;
          pack_slug?: string | null;
          credits_granted?: number | null;
          validity_days?: number | null;
          granted_at?: string | null;
          updated_at?: string;
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
      /* ── 0004_extension.sql — the Chrome extension control plane ──────── */
      /**
       * One row per extension install. `device_id` is a random UUID the
       * extension generates on first install; it identifies an install, not a
       * machine. Written only by the service role, through the SQL functions.
       */
      extension_devices: {
        Row: {
          id: string;
          user_id: string;
          device_id: string;
          label: string | null;
          ext_version: string | null;
          status: "active" | "revoked";
          last_seen_at: string;
          revoked_at: string | null;
          created_at: string;
        };
        Insert: { user_id: string; device_id: string };
        Update: { status?: "active" | "revoked" };
        Relationships: [];
      };
      /**
       * Adapter health checks. Holds a feature name, a check key, a status, the
       * extension version, the device id and an id-stripped URL path — nothing
       * else, ever. See the comment block in 0004_extension.sql.
       */
      extension_events: {
        Row: {
          id: number;
          user_id: string | null;
          device_id: string | null;
          ext_version: string | null;
          feature: string;
          check_key: string;
          status: "ok" | "not_found" | "error";
          path: string | null;
          detail: string | null;
          created_at: string;
        };
        Insert: { feature: string; check_key: string; status: string };
        Update: { detail?: string | null };
        Relationships: [];
      };
      /** Idempotency ledger for credit spends — one row per final export. */
      credit_claims: {
        Row: {
          idempotency_key: string;
          user_id: string;
          device_id: string | null;
          action: string;
          amount: number;
          usage_snapshot: Json;
          created_at: string;
        };
        Insert: {
          idempotency_key: string;
          user_id: string;
          action: string;
          amount: number;
        };
        Update: { usage_snapshot?: Json };
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
      /* ── 0005_billing.sql ─────────────────────────────────────────────────
       * grant_credit_pack is SERVICE-ROLE ONLY: it is the only thing that adds
       * paid credits, and it takes a payment id rather than an amount so a
       * caller cannot invent one. EXECUTE is revoked from public. */
      grant_credit_pack: {
        Args: { p_payment_id: string };
        Returns: Database["public"]["Tables"]["usage"]["Row"];
      };
      expire_credits_if_due: {
        Args: { p_user: string };
        Returns: Database["public"]["Tables"]["usage"]["Row"];
      };
      /* ── 0004_extension.sql ───────────────────────────────────────────────
       * Called by /api/extension/* with the SERVICE ROLE only: each one takes
       * the user id explicitly, so the route's JWT check is what ties a call to
       * a person. EXECUTE is revoked from public, so no client can reach them. */
      extension_device_limit: {
        Args: { p_user: string };
        Returns: number;
      };
      extension_device_list: {
        Args: { p_user: string };
        Returns: Json;
      };
      register_extension_device: {
        Args: {
          p_user: string;
          p_device_id: string;
          p_label?: string | null;
          p_version?: string | null;
        };
        Returns: Json;
      };
      revoke_extension_device: {
        Args: { p_user: string; p_device_id: string };
        Returns: Json;
      };
      extension_heartbeat: {
        Args: { p_user: string; p_device_id: string; p_version?: string | null };
        Returns: Json;
      };
      /** consume_credit, keyed to a device AND an idempotency key. */
      consume_credit_for: {
        Args: {
          p_user: string;
          p_device_id: string;
          p_idempotency_key: string;
          p_action?: string;
          p_amount?: number;
        };
        Returns: Database["public"]["Tables"]["usage"]["Row"];
      };
      record_extension_events: {
        Args: {
          p_user: string;
          p_device_id: string | null;
          p_version: string | null;
          p_events: Json;
        };
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
export type CreditPack = Database["public"]["Tables"]["credit_packs"]["Row"];
export type AdminAction = Database["public"]["Tables"]["admin_actions"]["Row"];
export type AdminUserRow = Database["public"]["Views"]["admin_users"]["Row"];
