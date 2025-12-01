import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user: requestingUser }, error: authError } = await supabaseAdmin.auth.getUser(token)
    
    if (authError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { data: roles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'admin')
      .single()

    if (!roles) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { userId } = await req.json()
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'User ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (userId === requestingUser.id) {
      return new Response(
        JSON.stringify({ error: 'Cannot delete your own account' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`Starting deletion process for user: ${userId}`)

    // 1. Delete user's commissions
    const { error: commErr } = await supabaseAdmin
      .from('commissions')
      .delete()
      .eq('user_id', userId)
    if (commErr) console.log('Error deleting commissions:', commErr.message)

    // 2. Delete user's notifications
    const { error: notifErr } = await supabaseAdmin
      .from('notifications')
      .delete()
      .eq('recipient_id', userId)
    if (notifErr) console.log('Error deleting notifications:', notifErr.message)

    // 3. Delete user's order comments
    const { error: commentsErr } = await supabaseAdmin
      .from('order_comments')
      .delete()
      .eq('user_id', userId)
    if (commentsErr) console.log('Error deleting order comments:', commentsErr.message)

    // 4. Nullify references in orders (designer_id, salesperson_id)
    await supabaseAdmin
      .from('orders')
      .update({ designer_id: null })
      .eq('designer_id', userId)
    
    await supabaseAdmin
      .from('orders')
      .update({ salesperson_id: null })
      .eq('salesperson_id', userId)

    // 4b. Nullify print_operator_id in orders
    await supabaseAdmin
      .from('orders')
      .update({ print_operator_id: null })
      .eq('print_operator_id', userId)

    // 5. Nullify references in order_files (uploaded_by)
    await supabaseAdmin
      .from('order_files')
      .update({ uploaded_by: null })
      .eq('uploaded_by', userId)

    // 6. Nullify references in order_history (user_id)
    await supabaseAdmin
      .from('order_history')
      .update({ user_id: null })
      .eq('user_id', userId)

    // 7. Nullify references in payments (recorded_by)
    await supabaseAdmin
      .from('payments')
      .update({ recorded_by: null })
      .eq('recorded_by', userId)

    // 8. Nullify references in expenses (recorded_by, approved_by)
    await supabaseAdmin
      .from('expenses')
      .update({ recorded_by: null })
      .eq('recorded_by', userId)
    
    await supabaseAdmin
      .from('expenses')
      .update({ approved_by: null })
      .eq('approved_by', userId)

    // 9. Nullify references in invoices (created_by)
    await supabaseAdmin
      .from('invoices')
      .update({ created_by: null })
      .eq('created_by', userId)

    // 10. Nullify paid_by in commissions
    await supabaseAdmin
      .from('commissions')
      .update({ paid_by: null })
      .eq('paid_by', userId)

    // 11. Delete user roles
    const { error: rolesErr } = await supabaseAdmin
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
    if (rolesErr) console.log('Error deleting user roles:', rolesErr.message)

    // 12. Delete profile
    const { error: profileErr } = await supabaseAdmin
      .from('profiles')
      .delete()
      .eq('id', userId)
    if (profileErr) console.log('Error deleting profile:', profileErr.message)

    // 13. Finally delete the auth user
    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(userId)

    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
      return new Response(
        JSON.stringify({ error: deleteError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`User ${userId} permanently deleted successfully`)

    return new Response(
      JSON.stringify({ success: true, message: 'User permanently deleted' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Error in delete-user function:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
