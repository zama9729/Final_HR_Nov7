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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      employees: {
        Row: {
          created_at: string | null
          department: string | null
          employee_id: string
          id: string
          join_date: string | null
          must_change_password: boolean | null
          onboarding_status:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          position: string | null
          reporting_manager_id: string | null
          status: string | null
          temporary_password: string | null
          updated_at: string | null
          user_id: string
          work_location: string | null
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          employee_id: string
          id?: string
          join_date?: string | null
          must_change_password?: boolean | null
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          position?: string | null
          reporting_manager_id?: string | null
          status?: string | null
          temporary_password?: string | null
          updated_at?: string | null
          user_id: string
          work_location?: string | null
        }
        Update: {
          created_at?: string | null
          department?: string | null
          employee_id?: string
          id?: string
          join_date?: string | null
          must_change_password?: boolean | null
          onboarding_status?:
            | Database["public"]["Enums"]["onboarding_status"]
            | null
          position?: string | null
          reporting_manager_id?: string | null
          status?: string | null
          temporary_password?: string | null
          updated_at?: string | null
          user_id?: string
          work_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "employees_reporting_manager_id_fkey"
            columns: ["reporting_manager_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      leave_policies: {
        Row: {
          accrual_frequency: string | null
          annual_entitlement: number
          carry_forward_allowed: boolean | null
          created_at: string | null
          encashment_allowed: boolean | null
          id: string
          is_active: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          max_carry_forward: number | null
          name: string
          probation_entitlement: number | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          accrual_frequency?: string | null
          annual_entitlement: number
          carry_forward_allowed?: boolean | null
          created_at?: string | null
          encashment_allowed?: boolean | null
          id?: string
          is_active?: boolean | null
          leave_type: Database["public"]["Enums"]["leave_type"]
          max_carry_forward?: number | null
          name: string
          probation_entitlement?: number | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          accrual_frequency?: string | null
          annual_entitlement?: number
          carry_forward_allowed?: boolean | null
          created_at?: string | null
          encashment_allowed?: boolean | null
          id?: string
          is_active?: boolean | null
          leave_type?: Database["public"]["Enums"]["leave_type"]
          max_carry_forward?: number | null
          name?: string
          probation_entitlement?: number | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      onboarding_data: {
        Row: {
          aadhar_number: string | null
          address: string | null
          bank_account_number: string | null
          bank_branch: string | null
          bank_name: string | null
          city: string | null
          completed_at: string | null
          created_at: string | null
          emergency_contact_name: string | null
          emergency_contact_phone: string | null
          emergency_contact_relation: string | null
          employee_id: string
          id: string
          ifsc_code: string | null
          pan_number: string | null
          postal_code: string | null
          state: string | null
          updated_at: string | null
        }
        Insert: {
          aadhar_number?: string | null
          address?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          city?: string | null
          completed_at?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id: string
          id?: string
          ifsc_code?: string | null
          pan_number?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Update: {
          aadhar_number?: string | null
          address?: string | null
          bank_account_number?: string | null
          bank_branch?: string | null
          bank_name?: string | null
          city?: string | null
          completed_at?: string | null
          created_at?: string | null
          emergency_contact_name?: string | null
          emergency_contact_phone?: string | null
          emergency_contact_relation?: string | null
          employee_id?: string
          id?: string
          ifsc_code?: string | null
          pan_number?: string | null
          postal_code?: string | null
          state?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_data_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string | null
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          phone: string | null
          security_answer_1: string | null
          security_answer_2: string | null
          security_question_1: string | null
          security_question_2: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          first_name?: string | null
          id: string
          last_name?: string | null
          phone?: string | null
          security_answer_1?: string | null
          security_answer_2?: string | null
          security_question_1?: string | null
          security_question_2?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          phone?: string | null
          security_answer_1?: string | null
          security_answer_2?: string | null
          security_question_1?: string | null
          security_question_2?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      workflows: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          name: string
          status: string | null
          tenant_id: string
          updated_at: string | null
          workflow_json: Json
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          status?: string | null
          tenant_id: string
          updated_at?: string | null
          workflow_json: Json
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
          workflow_json?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_role: {
        Args: { _user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "employee" | "manager" | "hr" | "director" | "ceo"
      leave_type:
        | "annual"
        | "sick"
        | "casual"
        | "maternity"
        | "paternity"
        | "bereavement"
      onboarding_status: "pending" | "in_progress" | "completed" | "not_started"
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
    Enums: {
      app_role: ["employee", "manager", "hr", "director", "ceo"],
      leave_type: [
        "annual",
        "sick",
        "casual",
        "maternity",
        "paternity",
        "bereavement",
      ],
      onboarding_status: ["pending", "in_progress", "completed", "not_started"],
    },
  },
} as const
