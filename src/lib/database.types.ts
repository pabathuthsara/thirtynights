export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      chapters: {
        Row: {
          completed_at: string | null
          id: string
          length: number
          purchase_id: string | null
          question_set: string
          started_at: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          id?: string
          length: number
          purchase_id?: string | null
          question_set: string
          started_at?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          id?: string
          length?: number
          purchase_id?: string | null
          question_set?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chapters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      devices: {
        Row: {
          id: string
          last_seen_at: string
          push_token: string | null
          user_id: string
        }
        Insert: {
          id?: string
          last_seen_at?: string
          push_token?: string | null
          user_id: string
        }
        Update: {
          id?: string
          last_seen_at?: string
          push_token?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      nights: {
        Row: {
          chapter_id: string
          duration_sec: number | null
          id: string
          index: number
          local_path: string | null
          question_id: string
          recorded_at: string | null
          recorded_hour: number | null
          revealed_at: string | null
          sealed: boolean
          storage_path: string | null
          transcript: string | null
        }
        Insert: {
          chapter_id: string
          duration_sec?: number | null
          id?: string
          index: number
          local_path?: string | null
          question_id: string
          recorded_at?: string | null
          recorded_hour?: number | null
          revealed_at?: string | null
          sealed?: boolean
          storage_path?: string | null
          transcript?: string | null
        }
        Update: {
          chapter_id?: string
          duration_sec?: number | null
          id?: string
          index?: number
          local_path?: string | null
          question_id?: string
          recorded_at?: string | null
          recorded_hour?: number | null
          revealed_at?: string | null
          sealed?: boolean
          storage_path?: string | null
          transcript?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nights_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          amount_usd: number
          id: string
          product_id: string
          purchased_at: string
          revoked_at: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          amount_usd: number
          id?: string
          product_id: string
          purchased_at?: string
          revoked_at?: string | null
          transaction_id: string
          user_id: string
        }
        Update: {
          amount_usd?: number
          id?: string
          product_id?: string
          purchased_at?: string
          revoked_at?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          audio_path: string | null
          chapter_id: string
          generated_at: string | null
          id: string
          kind: string
          sections: Json | null
          status: string
        }
        Insert: {
          audio_path?: string | null
          chapter_id: string
          generated_at?: string | null
          id?: string
          kind: string
          sections?: Json | null
          status?: string
        }
        Update: {
          audio_path?: string | null
          chapter_id?: string
          generated_at?: string | null
          id?: string
          kind?: string
          sections?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reports_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          apple_private_relay: boolean
          auth_provider: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
        }
        Insert: {
          apple_private_relay?: boolean
          auth_provider?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id: string
        }
        Update: {
          apple_private_relay?: boolean
          auth_provider?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

