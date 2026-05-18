export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

// ── Enum types ────────────────────────────────────────────────────────────────
export type PermissionLevel = 'none' | 'read' | 'write' | 'full'
export type UserRole        = 'super_admin' | 'admin' | 'manager' | 'staff' | 'read_only' | 'upload'
export type PlanType        = 'standard' | 'enterprise'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'canceled'

export interface Database {
  public: {
    Tables: {
      // ── m01_profiles (hotel_id 제거됨) ──────────────────────────────────
      m01_profiles: {
        Row: {
          id:            string
          auth_user_id:  string
          email:         string
          name:          string
          role:          UserRole
          is_active:     boolean
          last_login_at: string | null
          created_at:    string
          updated_at:    string
        }
        Insert: {
          id?:            string
          auth_user_id:   string
          email:          string
          name:           string
          role?:          UserRole
          is_active?:     boolean
          last_login_at?: string | null
          created_at?:    string
          updated_at?:    string
        }
        Update: {
          auth_user_id?:  string
          email?:         string
          name?:          string
          role?:          UserRole
          is_active?:     boolean
          last_login_at?: string | null
          updated_at?:    string
        }
        Relationships: []
      }
      // ── m02_hotels ───────────────────────────────────────────────────────
      m02_hotels: {
        Row: {
          id:                  string
          hotel_name:          string
          slug:                string
          plan:                PlanType | null
          is_active:           boolean
          subscription_status: SubscriptionStatus | null
          trial_ends_at:       string | null
          subscribed_at:       string | null
          subscription_ends_at: string | null
          created_at:          string
          updated_at:          string
        }
        Insert: {
          id?:                  string
          hotel_name:           string
          slug:                 string
          plan?:                PlanType | null
          is_active?:           boolean
          subscription_status?: SubscriptionStatus | null
          trial_ends_at?:       string | null
          subscribed_at?:       string | null
          subscription_ends_at?: string | null
          created_at?:          string
          updated_at?:          string
        }
        Update: {
          hotel_name?:          string
          slug?:                string
          plan?:                PlanType | null
          is_active?:           boolean
          subscription_status?: SubscriptionStatus | null
          trial_ends_at?:       string | null
          updated_at?:          string
        }
        Relationships: []
      }
      // ── m03_hotel_details ────────────────────────────────────────────────
      m03_hotel_details: {
        Row: {
          id:          string
          hotel_id:    string
          address:     string | null
          city:        string | null
          country:     string | null
          timezone:    string | null
          phone:       string | null
          email:       string | null
          website:     string | null
          star_rating: number | null
          room_count:  number | null
          branch_name: string | null
          logo_url:    string | null
        }
        Insert: {
          id?:          string
          hotel_id:     string
          address?:     string | null
          city?:        string | null
          country?:     string | null
          timezone?:    string | null
          phone?:       string | null
          email?:       string | null
          website?:     string | null
          star_rating?: number | null
          room_count?:  number | null
          branch_name?: string | null
          logo_url?:    string | null
        }
        Update: {
          address?:     string | null
          city?:        string | null
          country?:     string | null
          timezone?:    string | null
          phone?:       string | null
          email?:       string | null
          website?:     string | null
          star_rating?: number | null
          room_count?:  number | null
          branch_name?: string | null
          logo_url?:    string | null
        }
        Relationships: []
      }
      // ── m06_saas_menus ───────────────────────────────────────────────────
      m06_saas_menus: {
        Row: {
          id:         string
          key:        string
          name:       string
          icon:       string | null
          path:       string | null
          menu_type:  'main' | 'sub' | 'setting' | null
          sort_order: number | null
          is_active:  boolean
        }
        Insert: {
          id?:         string
          key:         string
          name:        string
          icon?:       string | null
          path?:       string | null
          menu_type?:  'main' | 'sub' | 'setting' | null
          sort_order?: number | null
          is_active?:  boolean
        }
        Update: {
          key?:        string
          name?:       string
          icon?:       string | null
          path?:       string | null
          menu_type?:  'main' | 'sub' | 'setting' | null
          sort_order?: number | null
          is_active?:  boolean
        }
        Relationships: []
      }
      // ── m08_user_menu_permissions (hotel_id 추가됨) ──────────────────────
      m08_user_menu_permissions: {
        Row: {
          id:         string
          user_id:    string
          hotel_id:   string | null
          menu_id:    string
          permission: PermissionLevel
          updated_by: string | null
          updated_at: string
        }
        Insert: {
          id?:         string
          user_id:     string
          hotel_id?:   string | null
          menu_id:     string
          permission:  PermissionLevel
          updated_by?: string | null
          updated_at?: string
        }
        Update: {
          hotel_id?:   string | null
          permission?:  PermissionLevel
          updated_by?:  string | null
          updated_at?:  string
        }
        Relationships: []
      }
      // ── m09_user_default_page ────────────────────────────────────────────
      m09_user_default_page: {
        Row: {
          id:         string
          user_id:    string
          menu_id:    string
          updated_at: string
        }
        Insert: {
          id?:         string
          user_id:     string
          menu_id:     string
          updated_at?: string
        }
        Update: {
          menu_id?:    string
          updated_at?: string
        }
        Relationships: []
      }
      // ── m10_profile_hotels (신규) ────────────────────────────────────────
      m10_profile_hotels: {
        Row: {
          id:         string
          profile_id: string
          hotel_id:   string
          role:       UserRole
          is_active:  boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?:        string
          profile_id: string
          hotel_id:   string
          role?:      UserRole
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          role?:      UserRole
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      // ── profiles (legacy — 기존 코드 호환) ───────────────────────────────
      profiles: {
        Row: {
          id:            string
          auth_user_id:  string
          email:         string
          name:          string
          role:          UserRole
          is_active:     boolean
          last_login_at: string | null
          created_at:    string
          updated_at:    string
        }
        Insert: {
          id?:            string
          auth_user_id:   string
          email:          string
          name:           string
          role?:          UserRole
          is_active?:     boolean
          last_login_at?: string | null
        }
        Update: {
          name?:          string
          role?:          UserRole
          is_active?:     boolean
          last_login_at?: string | null
          updated_at?:    string
        }
        Relationships: []
      }
      // ── properties (legacy) ──────────────────────────────────────────────
      properties: {
        Row: {
          id:          string
          created_at:  string
          name:        string
          code:        string
          timezone:    string
          currency:    string
          total_rooms: number
        }
        Insert: {
          name:         string
          code:         string
          timezone?:    string
          currency?:    string
          total_rooms:  number
        }
        Update: {
          name?:        string
          code?:        string
          timezone?:    string
          currency?:    string
          total_rooms?: number
        }
        Relationships: []
      }
    }
    Views:          Record<string, never>
    Functions:      Record<string, never>
    Enums: {
      user_role:        UserRole
      permission_level: PermissionLevel
    }
    CompositeTypes: Record<string, never>
  }
}

// ── 편의 타입 ────────────────────────────────────────────────────────────────
export type Profile         = Database['public']['Tables']['m01_profiles']['Row']
export type Hotel           = Database['public']['Tables']['m02_hotels']['Row']
export type HotelDetail     = Database['public']['Tables']['m03_hotel_details']['Row']
export type SaasMenu        = Database['public']['Tables']['m06_saas_menus']['Row']
export type UserMenuPerm    = Database['public']['Tables']['m08_user_menu_permissions']['Row']
export type UserDefaultPage = Database['public']['Tables']['m09_user_default_page']['Row']
export type ProfileHotel    = Database['public']['Tables']['m10_profile_hotels']['Row']
export type Property        = Database['public']['Tables']['properties']['Row']

// ── 조인 편의 타입 ────────────────────────────────────────────────────────────
export type ProfileWithHotels = Profile & {
  m10_profile_hotels: Pick<ProfileHotel, 'hotel_id' | 'role' | 'is_active'>[]
}
