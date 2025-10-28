import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.76.1';
import { corsHeaders } from '../_shared/cors.ts';

interface CreateEmployeeRequest {
  firstName: string;
  lastName: string;
  email: string;
  employeeId: string;
  department: string;
  position: string;
  workLocation: string;
  joinDate: string;
  reportingManagerId?: string;
  role: 'employee' | 'manager' | 'hr' | 'director' | 'ceo';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Create employee function invoked');
    
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the requesting user has HR/Director/CEO role
    const authHeader = req.headers.get('Authorization');
    
    if (!authHeader) {
      console.error('No authorization header');
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Check if user has required role
    const { data: roleData, error: roleCheckError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (roleCheckError) {
      console.error('Role check error:', roleCheckError);
    }

    if (!roleData || !['hr', 'director', 'ceo'].includes(roleData.role)) {
      console.error('Insufficient permissions. Role:', roleData?.role);
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User has required role:', roleData.role);

    const requestData: CreateEmployeeRequest = await req.json();
    console.log('Creating employee with email:', requestData.email);

    // Generate temporary password that employee won't use directly
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-8).toUpperCase();

    // Create user account
    const { data: authData, error: createUserError } = await supabaseAdmin.auth.admin.createUser({
      email: requestData.email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: {
        first_name: requestData.firstName,
        last_name: requestData.lastName,
        needs_password_setup: true,
      },
    });

    if (createUserError) {
      console.error('Error creating user:', createUserError);
      throw createUserError;
    }

    console.log('User created:', authData.user.id);

    // Create employee record
    const { error: employeeError } = await supabaseAdmin
      .from('employees')
      .insert({
        user_id: authData.user.id,
        employee_id: requestData.employeeId,
        department: requestData.department,
        position: requestData.position,
        work_location: requestData.workLocation,
        join_date: requestData.joinDate,
        reporting_manager_id: requestData.reportingManagerId || null,
        temporary_password: tempPassword,
        must_change_password: true,
        onboarding_status: 'not_started',
      });

    if (employeeError) {
      console.error('Error creating employee:', employeeError);
      throw employeeError;
    }

    console.log('Employee record created');

    // Assign role
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .insert({
        user_id: authData.user.id,
        role: requestData.role,
      });

    if (roleError) {
      console.error('Error assigning role:', roleError);
      throw roleError;
    }

    console.log('Role assigned:', requestData.role);

    return new Response(
      JSON.stringify({ 
        success: true,
        temporaryPassword: tempPassword,
        email: requestData.email,
        message: 'Employee created successfully. Share the temporary password with them.',
        userId: authData.user.id
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
    console.error('Function error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
