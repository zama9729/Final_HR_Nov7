-- Create appraisal_cycles table
CREATE TABLE public.appraisal_cycles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  cycle_name TEXT NOT NULL,
  cycle_year INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'draft')),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create performance_reviews table
CREATE TABLE public.performance_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id UUID NOT NULL,
  appraisal_cycle_id UUID NOT NULL REFERENCES public.appraisal_cycles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.employees(id),
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  performance_score DECIMAL(3,2) CHECK (performance_score >= 0 AND performance_score <= 5),
  strengths TEXT,
  areas_of_improvement TEXT,
  goals TEXT,
  comments TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'acknowledged')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(appraisal_cycle_id, employee_id)
);

-- Enable RLS
ALTER TABLE public.appraisal_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;

-- RLS Policies for appraisal_cycles
CREATE POLICY "HR can manage appraisal cycles"
ON public.appraisal_cycles
FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND
  (has_role(auth.uid(), 'hr') OR has_role(auth.uid(), 'director') OR has_role(auth.uid(), 'ceo'))
);

CREATE POLICY "Managers can view appraisal cycles"
ON public.appraisal_cycles
FOR SELECT
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND
  has_role(auth.uid(), 'manager')
);

-- RLS Policies for performance_reviews
CREATE POLICY "Employees can view their own reviews"
ON public.performance_reviews
FOR SELECT
USING (employee_id = get_employee_id(auth.uid()));

CREATE POLICY "Managers can view and manage their team reviews"
ON public.performance_reviews
FOR ALL
USING (
  reviewer_id = get_employee_id(auth.uid()) OR
  EXISTS (
    SELECT 1 FROM employees e
    WHERE e.id = performance_reviews.employee_id
    AND e.reporting_manager_id = get_employee_id(auth.uid())
  )
);

CREATE POLICY "HR can manage all reviews"
ON public.performance_reviews
FOR ALL
USING (
  tenant_id = get_user_tenant_id(auth.uid()) AND
  (has_role(auth.uid(), 'hr') OR has_role(auth.uid(), 'director') OR has_role(auth.uid(), 'ceo'))
);

-- Add trigger for updated_at
CREATE TRIGGER update_appraisal_cycles_updated_at
  BEFORE UPDATE ON public.appraisal_cycles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_reviews_updated_at
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();