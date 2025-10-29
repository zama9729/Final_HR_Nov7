import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.76.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { shifts } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Creating notifications for shifts:', shifts);

    // Create notifications for each shift
    const notifications = [];
    for (const shift of shifts) {
      // Get employee's user_id
      const { data: employee } = await supabase
        .from('employees')
        .select('user_id, tenant_id, profiles(first_name, last_name)')
        .eq('id', shift.employee_id)
        .single();

      if (employee) {
        notifications.push({
          tenant_id: employee.tenant_id,
          user_id: employee.user_id,
          title: 'New Shift Assigned',
          message: `You have been assigned a ${shift.shift_type} shift on ${new Date(shift.shift_date).toLocaleDateString()} from ${shift.start_time} to ${shift.end_time}`,
          type: 'shift',
          link: '/shifts',
        });
      }
    }

    if (notifications.length > 0) {
      const { error } = await supabase
        .from('notifications')
        .insert(notifications);

      if (error) {
        console.error('Error creating notifications:', error);
        throw error;
      }

      console.log(`Created ${notifications.length} notifications`);
    }

    return new Response(
      JSON.stringify({ success: true, count: notifications.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in notify-shift-created:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});