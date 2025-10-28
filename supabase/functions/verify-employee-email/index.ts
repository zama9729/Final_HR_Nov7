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

    const { email } = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Verifying employee email:', email);

    // First, find the user by email in profiles
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (profileError || !profile) {
      console.log('Profile not found:', profileError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'No employee found with this email address. Please contact HR.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Now check if employee exists and needs password setup
    const { data: employee, error: employeeError } = await supabase
      .from('employees')
      .select('id, user_id, must_change_password')
      .eq('user_id', profile.id)
      .single();

    if (employeeError || !employee) {
      console.log('Employee not found:', employeeError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'No employee found with this email address. Please contact HR.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if they still need to set up password
    if (!employee.must_change_password) {
      console.log('Employee already completed setup');
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'This account has already been set up. Please use the login page.' 
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Employee verified successfully');
    return new Response(
      JSON.stringify({ 
        valid: true, 
        employeeId: employee.id 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('Error in verify-employee-email:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
