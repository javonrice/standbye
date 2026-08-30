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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      airports: {
        Row: {
          city: string | null
          country: string | null
          iata: string
          icao: string | null
          lat: number
          lon: number
          name: string
          region: string | null
          resolved_at: string | null
          source: string | null
          state: string | null
          tz: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          iata: string
          icao?: string | null
          lat: number
          lon: number
          name: string
          region?: string | null
          resolved_at?: string | null
          source?: string | null
          state?: string | null
          tz: string
        }
        Update: {
          city?: string | null
          country?: string | null
          iata?: string
          icao?: string | null
          lat?: number
          lon?: number
          name?: string
          region?: string | null
          resolved_at?: string | null
          source?: string | null
          state?: string | null
          tz?: string
        }
        Relationships: []
      }
      api_usage_log: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          provider: string
          tier_est: number | null
          trip_id: string | null
          units_est: number
        }
        Insert: {
          created_at?: string
          endpoint: string
          id?: string
          provider?: string
          tier_est?: number | null
          trip_id?: string | null
          units_est?: number
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          provider?: string
          tier_est?: number | null
          trip_id?: string | null
          units_est?: number
        }
        Relationships: []
      }
      briefings: {
        Row: {
          arr_card_status: string
          chain_card_status: string
          dep_card_status: string
          generated_at: string
          headline: string
          id: string
          pressure_index: number | null
          source_freshness: Json
          status: string
          trip_id: string
          unavailable_categories: string[]
          why_summary: string | null
        }
        Insert: {
          arr_card_status?: string
          chain_card_status?: string
          dep_card_status?: string
          generated_at?: string
          headline: string
          id?: string
          pressure_index?: number | null
          source_freshness?: Json
          status: string
          trip_id: string
          unavailable_categories?: string[]
          why_summary?: string | null
        }
        Update: {
          arr_card_status?: string
          chain_card_status?: string
          dep_card_status?: string
          generated_at?: string
          headline?: string
          id?: string
          pressure_index?: number | null
          source_freshness?: Json
          status?: string
          trip_id?: string
          unavailable_categories?: string[]
          why_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "briefings_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      change_events: {
        Row: {
          briefing_id: string | null
          change_type: string
          detail: string | null
          headline: string
          id: string
          occurred_at: string
          payload: Json
          seen: boolean
          trip_id: string
        }
        Insert: {
          briefing_id?: string | null
          change_type: string
          detail?: string | null
          headline: string
          id?: string
          occurred_at?: string
          payload?: Json
          seen?: boolean
          trip_id: string
        }
        Update: {
          briefing_id?: string | null
          change_type?: string
          detail?: string | null
          headline?: string
          id?: string
          occurred_at?: string
          payload?: Json
          seen?: boolean
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_events_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "briefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_events_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      curated_events: {
        Row: {
          city: string | null
          created_at: string
          demand_class: string
          ends_on: string
          id: string
          lat: number | null
          lon: number | null
          name: string
          source: string
          source_ref: string | null
          starts_on: string
          state: string | null
          venue: string | null
        }
        Insert: {
          city?: string | null
          created_at?: string
          demand_class: string
          ends_on: string
          id?: string
          lat?: number | null
          lon?: number | null
          name: string
          source?: string
          source_ref?: string | null
          starts_on: string
          state?: string | null
          venue?: string | null
        }
        Update: {
          city?: string | null
          created_at?: string
          demand_class?: string
          ends_on?: string
          id?: string
          lat?: number | null
          lon?: number | null
          name?: string
          source?: string
          source_ref?: string | null
          starts_on?: string
          state?: string | null
          venue?: string | null
        }
        Relationships: []
      }
      hist_dataset_months: {
        Row: {
          available_after: string
          dataset: string
          loaded_at: string
          month: number
          year: number
        }
        Insert: {
          available_after: string
          dataset: string
          loaded_at?: string
          month: number
          year: number
        }
        Update: {
          available_after?: string
          dataset?: string
          loaded_at?: string
          month?: number
          year?: number
        }
        Relationships: []
      }
      hist_ontime_pattern: {
        Row: {
          cancel_rate: number
          created_at: string
          dep15_rate: number
          dest_iata: string
          dow: number | null
          flights_sampled: number
          id: string
          marketing_carrier: string
          median_later_backups: number
          month: number
          origin_iata: string
          source_period: string
          time_block: string | null
          year: number | null
        }
        Insert: {
          cancel_rate?: number
          created_at?: string
          dep15_rate?: number
          dest_iata: string
          dow?: number | null
          flights_sampled?: number
          id?: string
          marketing_carrier?: string
          median_later_backups?: number
          month: number
          origin_iata: string
          source_period: string
          time_block?: string | null
          year?: number | null
        }
        Update: {
          cancel_rate?: number
          created_at?: string
          dep15_rate?: number
          dest_iata?: string
          dow?: number | null
          flights_sampled?: number
          id?: string
          marketing_carrier?: string
          median_later_backups?: number
          month?: number
          origin_iata?: string
          source_period?: string
          time_block?: string | null
          year?: number | null
        }
        Relationships: []
      }
      hist_t100_route_month: {
        Row: {
          avg_empty_seats: number
          created_at: string
          departures: number
          dest_iata: string
          id: string
          load_factor: number
          marketing_carrier: string
          month: number
          origin_iata: string
          passengers: number
          seats: number
          source_period: string
          vs_network_pp: number | null
          year: number
        }
        Insert: {
          avg_empty_seats?: number
          created_at?: string
          departures?: number
          dest_iata: string
          id?: string
          load_factor?: number
          marketing_carrier?: string
          month: number
          origin_iata: string
          passengers?: number
          seats?: number
          source_period: string
          vs_network_pp?: number | null
          year: number
        }
        Update: {
          avg_empty_seats?: number
          created_at?: string
          departures?: number
          dest_iata?: string
          id?: string
          load_factor?: number
          marketing_carrier?: string
          month?: number
          origin_iata?: string
          passengers?: number
          seats?: number
          source_period?: string
          vs_network_pp?: number | null
          year?: number
        }
        Relationships: []
      }
      notifications: {
        Row: {
          fingerprint: string
          id: string
          sent_at: string | null
          subject: string
          watch_id: string
        }
        Insert: {
          fingerprint: string
          id?: string
          sent_at?: string | null
          subject: string
          watch_id: string
        }
        Update: {
          fingerprint?: string
          id?: string
          sent_at?: string | null
          subject?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watches"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_change_events: {
        Row: {
          detail: string | null
          headline: string
          id: string
          kind: string
          occurred_at: string
          payload: Json
          seen: boolean
          severity: string
          user_id: string
          watch_id: string
        }
        Insert: {
          detail?: string | null
          headline: string
          id?: string
          kind: string
          occurred_at?: string
          payload?: Json
          seen?: boolean
          severity?: string
          user_id: string
          watch_id: string
        }
        Update: {
          detail?: string | null
          headline?: string
          id?: string
          kind?: string
          occurred_at?: string
          payload?: Json
          seen?: boolean
          severity?: string
          user_id?: string
          watch_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_change_events_watch_id_fkey"
            columns: ["watch_id"]
            isOneToOne: false
            referencedRelation: "watch_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_options: {
        Row: {
          arr_local: string | null
          carrier: string | null
          confidence: string
          created_at: string
          dep_local: string | null
          dest_iata: string
          evidence: Json
          flight_label: string
          flight_number: string | null
          headline: string
          id: string
          is_current: boolean
          kind: string
          label: string
          option_key: string | null
          origin_iata: string
          pillars: Json
          plan_id: string
          rank: number
          reasons: Json
          recovery: Json
          refreshed_at: string
          sched_arr_utc: string | null
          sched_dep_utc: string | null
          score: number
          segments: Json
          user_id: string
        }
        Insert: {
          arr_local?: string | null
          carrier?: string | null
          confidence?: string
          created_at?: string
          dep_local?: string | null
          dest_iata: string
          evidence?: Json
          flight_label: string
          flight_number?: string | null
          headline?: string
          id?: string
          is_current?: boolean
          kind?: string
          label?: string
          option_key?: string | null
          origin_iata: string
          pillars?: Json
          plan_id: string
          rank?: number
          reasons?: Json
          recovery?: Json
          refreshed_at?: string
          sched_arr_utc?: string | null
          sched_dep_utc?: string | null
          score?: number
          segments?: Json
          user_id: string
        }
        Update: {
          arr_local?: string | null
          carrier?: string | null
          confidence?: string
          created_at?: string
          dep_local?: string | null
          dest_iata?: string
          evidence?: Json
          flight_label?: string
          flight_number?: string | null
          headline?: string
          id?: string
          is_current?: boolean
          kind?: string
          label?: string
          option_key?: string | null
          origin_iata?: string
          pillars?: Json
          plan_id?: string
          rank?: number
          reasons?: Json
          recovery?: Json
          refreshed_at?: string
          sched_arr_utc?: string | null
          sched_dep_utc?: string | null
          score?: number
          segments?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_options_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          cabin: string
          created_at: string
          dest_iata: string
          id: string
          origin_iata: string
          prefs: Json
          primary_option_id: string | null
          travel_date: string
          travelers: number
          user_id: string
        }
        Insert: {
          cabin?: string
          created_at?: string
          dest_iata: string
          id?: string
          origin_iata: string
          prefs?: Json
          primary_option_id?: string | null
          travel_date: string
          travelers?: number
          user_id: string
        }
        Update: {
          cabin?: string
          created_at?: string
          dest_iata?: string
          id?: string
          origin_iata?: string
          prefs?: Json
          primary_option_id?: string | null
          travel_date?: string
          travelers?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_primary_option_id_fkey"
            columns: ["primary_option_id"]
            isOneToOne: false
            referencedRelation: "plan_options"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      reported_loads: {
        Row: {
          cabin: string
          checked_at: string
          created_at: string
          flight_label: string
          id: string
          open_seats: number | null
          party_included: string | null
          segment_key: string | null
          source: string
          standbys: number | null
          travel_date: string
          user_id: string
        }
        Insert: {
          cabin?: string
          checked_at?: string
          created_at?: string
          flight_label: string
          id?: string
          open_seats?: number | null
          party_included?: string | null
          segment_key?: string | null
          source?: string
          standbys?: number | null
          travel_date: string
          user_id: string
        }
        Update: {
          cabin?: string
          checked_at?: string
          created_at?: string
          flight_label?: string
          id?: string
          open_seats?: number | null
          party_included?: string | null
          segment_key?: string | null
          source?: string
          standbys?: number | null
          travel_date?: string
          user_id?: string
        }
        Relationships: []
      }
      serpapi_usage_log: {
        Row: {
          adults: number | null
          bucket: string | null
          created_at: string
          device_id: string | null
          flight_label: string | null
          id: string
          purpose: string
          route_key: string | null
          trip_id: string | null
        }
        Insert: {
          adults?: number | null
          bucket?: string | null
          created_at?: string
          device_id?: string | null
          flight_label?: string | null
          id?: string
          purpose?: string
          route_key?: string | null
          trip_id?: string | null
        }
        Update: {
          adults?: number | null
          bucket?: string | null
          created_at?: string
          device_id?: string | null
          flight_label?: string | null
          id?: string
          purpose?: string
          route_key?: string | null
          trip_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "serpapi_usage_log_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      signals: {
        Row: {
          active_from: string | null
          active_until: string | null
          briefing_id: string
          category: string
          confidence: string
          evidence: Json
          fingerprint: string
          id: string
          location: string
          retrieved_at: string
          severity: number
          source: string
          source_url: string | null
          summary: string
          title: string
          why_it_matters: string
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          briefing_id: string
          category: string
          confidence: string
          evidence?: Json
          fingerprint: string
          id?: string
          location: string
          retrieved_at: string
          severity: number
          source: string
          source_url?: string | null
          summary: string
          title: string
          why_it_matters: string
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          briefing_id?: string
          category?: string
          confidence?: string
          evidence?: Json
          fingerprint?: string
          id?: string
          location?: string
          retrieved_at?: string
          severity?: number
          source?: string
          source_url?: string | null
          summary?: string
          title?: string
          why_it_matters?: string
        }
        Relationships: [
          {
            foreignKeyName: "signals_briefing_id_fkey"
            columns: ["briefing_id"]
            isOneToOne: false
            referencedRelation: "briefings"
            referencedColumns: ["id"]
          },
        ]
      }
      source_cache: {
        Row: {
          cache_key: string
          expires_at: string
          fetched_at: string
          payload: Json
        }
        Insert: {
          cache_key: string
          expires_at: string
          fetched_at?: string
          payload: Json
        }
        Update: {
          cache_key?: string
          expires_at?: string
          fetched_at?: string
          payload?: Json
        }
        Relationships: []
      }
      standby_profiles: {
        Row: {
          access_mode: string
          airline_access: string[]
          airline_access_meta: Json
          coach_seen: string[]
          free_day_used: boolean
          home_airline: string
          home_airports: string[]
          notify_mode: string
          notify_optin: boolean
          onboarded_at: string | null
          pain_point: string | null
          traveler_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_mode?: string
          airline_access?: string[]
          airline_access_meta?: Json
          coach_seen?: string[]
          free_day_used?: boolean
          home_airline?: string
          home_airports?: string[]
          notify_mode?: string
          notify_optin?: boolean
          onboarded_at?: string | null
          pain_point?: string | null
          traveler_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_mode?: string
          airline_access?: string[]
          airline_access_meta?: Json
          coach_seen?: string[]
          free_day_used?: boolean
          home_airline?: string
          home_airports?: string[]
          notify_mode?: string
          notify_optin?: boolean
          onboarded_at?: string | null
          pain_point?: string | null
          traveler_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trips: {
        Row: {
          arr_window_end: string
          created_at: string
          dep_window_end: string
          dep_window_start: string
          dest_iata: string
          device_id: string | null
          flight_label: string
          flight_number: string
          flight_provider: string
          id: string
          marketing_carrier: string
          origin_iata: string
          provider_ref: Json
          sched_arr_utc: string | null
          sched_dep_utc: string | null
          share_token: string
          travel_date: string
          user_id: string | null
        }
        Insert: {
          arr_window_end: string
          created_at?: string
          dep_window_end: string
          dep_window_start: string
          dest_iata: string
          device_id?: string | null
          flight_label: string
          flight_number: string
          flight_provider?: string
          id?: string
          marketing_carrier?: string
          origin_iata: string
          provider_ref?: Json
          sched_arr_utc?: string | null
          sched_dep_utc?: string | null
          share_token?: string
          travel_date: string
          user_id?: string | null
        }
        Update: {
          arr_window_end?: string
          created_at?: string
          dep_window_end?: string
          dep_window_start?: string
          dest_iata?: string
          device_id?: string | null
          flight_label?: string
          flight_number?: string
          flight_provider?: string
          id?: string
          marketing_carrier?: string
          origin_iata?: string
          provider_ref?: Json
          sched_arr_utc?: string | null
          sched_dep_utc?: string | null
          share_token?: string
          travel_date?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trips_dest_iata_fkey"
            columns: ["dest_iata"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["iata"]
          },
          {
            foreignKeyName: "trips_origin_iata_fkey"
            columns: ["origin_iata"]
            isOneToOne: false
            referencedRelation: "airports"
            referencedColumns: ["iata"]
          },
        ]
      }
      watch_plans: {
        Row: {
          created_at: string
          ended_at: string | null
          id: string
          last_checked_at: string
          mode: string
          next_check_at: string | null
          plan_id: string | null
          plan_option_id: string
          snapshot: Json
          state: string
          unseen_changes: number
          user_id: string
          verdict: string
        }
        Insert: {
          created_at?: string
          ended_at?: string | null
          id?: string
          last_checked_at?: string
          mode?: string
          next_check_at?: string | null
          plan_id?: string | null
          plan_option_id: string
          snapshot?: Json
          state?: string
          unseen_changes?: number
          user_id: string
          verdict?: string
        }
        Update: {
          created_at?: string
          ended_at?: string | null
          id?: string
          last_checked_at?: string
          mode?: string
          next_check_at?: string | null
          plan_id?: string | null
          plan_option_id?: string
          snapshot?: Json
          state?: string
          unseen_changes?: number
          user_id?: string
          verdict?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_plans_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_plans_plan_option_id_fkey"
            columns: ["plan_option_id"]
            isOneToOne: false
            referencedRelation: "plan_options"
            referencedColumns: ["id"]
          },
        ]
      }
      watches: {
        Row: {
          created_at: string
          device_id: string | null
          email: string | null
          email_verified: boolean
          ended_at: string | null
          id: string
          last_briefing_id: string | null
          last_checked_at: string | null
          next_check_at: string | null
          state: string
          trip_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          device_id?: string | null
          email?: string | null
          email_verified?: boolean
          ended_at?: string | null
          id?: string
          last_briefing_id?: string | null
          last_checked_at?: string | null
          next_check_at?: string | null
          state?: string
          trip_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          device_id?: string | null
          email?: string | null
          email_verified?: boolean
          ended_at?: string | null
          id?: string
          last_briefing_id?: string | null
          last_checked_at?: string | null
          next_check_at?: string | null
          state?: string
          trip_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "watches_last_briefing_id_fkey"
            columns: ["last_briefing_id"]
            isOneToOne: false
            referencedRelation: "briefings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watches_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      api_units_this_month: { Args: { _provider?: string }; Returns: number }
      serpapi_probes_this_month: {
        Args: { _device_id?: string }
        Returns: number
      }
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
