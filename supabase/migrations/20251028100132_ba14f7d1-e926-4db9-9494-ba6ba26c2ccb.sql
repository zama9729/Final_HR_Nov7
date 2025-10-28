-- Enable realtime for timesheets and leave_requests tables for live notification updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.timesheets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;