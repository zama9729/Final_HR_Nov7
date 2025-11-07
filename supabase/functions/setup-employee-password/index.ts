import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { 
      email, 
      password, 
      securityQuestion1, 
      securityAnswer1, 
      securityQuestion2, 
      securityAnswer2 
    } = await req.json();

    console.log('Setting up password for employee:', email);

    // First, find the user by email in profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      console.error('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ error: 'Employee profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get employee details using user_id
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, user_id')
      .eq('user_id', profile.id)
      .single();

    if (employeeError || !employee) {
      console.error('Employee not found:', employeeError);
      return new Response(
        JSON.stringify({ error: 'Employee not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update user password and metadata using admin API
    const { error: updatePasswordError } = await supabase.auth.admin.updateUserById(
      employee.user_id,
      { 
        password,
        user_metadata: {
          needs_password_setup: false
        }
      }
    );

    if (updatePasswordError) {
      console.error('Error updating password:', updatePasswordError);
      throw updatePasswordError;
    }

    // Update employee record
    const { error: updateEmployeeError } = await supabase
      .from('employees')
      .update({
        must_change_password: false,
        onboarding_status: 'in_progress',
      })
      .eq('id', employee.id);

    if (updateEmployeeError) {
      console.error('Error updating employee:', updateEmployeeError);
      throw updateEmployeeError;
    }

    // Update profile with security questions
    const { error: updateProfileError } = await supabase
      .from('profiles')
      .update({
        security_question_1: securityQuestion1,
        security_answer_1: securityAnswer1,
        security_question_2: securityQuestion2,
        security_answer_2: securityAnswer2,
      })
      .eq('id', employee.user_id);

    if (updateProfileError) {
      console.error('Error updating profile:', updateProfileError);
    }

    console.log('Password setup completed successfully for:', email);

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in setup-employee-password:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
