// Auto-generated types for Supabase tables.
// Run `supabase gen types typescript` to regenerate after schema changes.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
    Tables: {
      users_profile: {
        Row: {
          id: string
          preferred_currency: string
          default_currency: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          preferred_currency?: string
          default_currency?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          preferred_currency?: string
          default_currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          type: string
          amount: number
          currency: string
          category_id: string
          description: string | null
          date: string
          exchange_rate: number | null
          direction: string | null
          /** 自动入账的来源（wechat / applepay / shot…），手记为 null。003 迁移加的列。 */
          source: string | null
          /** 来源里的唯一号（微信是交易号）。 */
          external_id: string | null
          /** 商户原名。 */
          merchant: string | null
          /** 自动入账时没能确定类目。 */
          needs_review: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          type: string
          amount: number
          currency: string
          category_id: string
          description?: string | null
          date: string
          exchange_rate?: number | null
          direction?: string | null
          source?: string | null
          external_id?: string | null
          merchant?: string | null
          needs_review?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          type?: string
          amount?: number
          currency?: string
          category_id?: string
          description?: string | null
          date?: string
          exchange_rate?: number | null
          direction?: string | null
          needs_review?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          type: string
          icon: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: string
          icon?: string
          created_at?: string
        }
        Update: {
          name?: string
          type?: string
          icon?: string
        }
        Relationships: []
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          category_id: string | null
          amount: number
          currency: string
          period: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category_id?: string | null
          amount: number
          currency: string
          period: string
          created_at?: string
        }
        Update: {
          category_id?: string | null
          amount?: number
          currency?: string
          period?: string
        }
        Relationships: []
      }
      merchant_rules: {
        Row: {
          user_id: string
          merchant_key: string
          category_id: string
          updated_at: string
        }
        Insert: {
          user_id: string
          merchant_key: string
          category_id: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingest_tokens: {
        Row: {
          id: string
          user_id: string
          token_hash: string
          label: string
          created_at: string
          last_used_at: string | null
        }
        Insert: {
          id?: string
          user_id: string
          token_hash: string
          label?: string
          created_at?: string
        }
        Update: {
          label?: string
        }
        Relationships: []
      }
    }
  }
}
