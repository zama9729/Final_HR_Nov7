import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Star, CheckCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface PerformanceReview {
  id: string;
  rating: number | null;
  performance_score: number | null;
  strengths: string | null;
  areas_of_improvement: string | null;
  goals: string | null;
  comments: string | null;
  status: string;
  appraisal_cycles: {
    cycle_name: string;
    cycle_year: number;
  };
  reviewer: {
    profiles: {
      first_name: string;
      last_name: string;
    };
  };
}

export default function MyAppraisal() {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<PerformanceReview[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMyReviews();
  }, [user]);

  const fetchMyReviews = async () => {
    try {
      const { data: employeeData } = await supabase
        .from('employees')
        .select('id')
        .eq('user_id', user?.id)
        .single();

      if (!employeeData) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('performance_reviews')
        .select(`
          *,
          appraisal_cycles (
            cycle_name,
            cycle_year
          ),
          reviewer:employees!performance_reviews_reviewer_id_fkey (
            profiles!employees_user_id_fkey (
              first_name,
              last_name
            )
          )
        `)
        .eq('employee_id', employeeData.id)
        .eq('status', 'submitted')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setReviews(data || []);
    } catch (error: any) {
      toast.error("Failed to fetch your reviews");
    } finally {
      setLoading(false);
    }
  };

  const acknowledgeReview = async (reviewId: string) => {
    try {
      const { error } = await supabase
        .from('performance_reviews')
        .update({ status: 'acknowledged' })
        .eq('id', reviewId);

      if (error) throw error;
      toast.success("Review acknowledged");
      fetchMyReviews();
    } catch (error: any) {
      toast.error("Failed to acknowledge review");
    }
  };

  const renderStars = (rating: number) => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`h-5 w-5 ${star <= rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted'}`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return <div className="container mx-auto p-6">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">My Performance Reviews</h1>
      </div>

      {reviews.length === 0 ? (
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground text-center">No performance reviews available yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {reviews.map((review) => (
            <Card key={review.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>
                      {review.appraisal_cycles?.cycle_name} - {review.appraisal_cycles?.cycle_year}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Reviewed by: {review.reviewer?.profiles?.first_name} {review.reviewer?.profiles?.last_name}
                    </p>
                  </div>
                  <Badge variant={review.status === 'acknowledged' ? 'secondary' : 'default'}>
                    {review.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Overall Rating</p>
                    {review.rating && renderStars(review.rating)}
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Performance Score</p>
                    <p className="text-2xl font-bold">{review.performance_score}/5.00</p>
                  </div>
                </div>

                {review.strengths && (
                  <div>
                    <p className="text-sm font-medium mb-2">Strengths</p>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      {review.strengths}
                    </p>
                  </div>
                )}

                {review.areas_of_improvement && (
                  <div>
                    <p className="text-sm font-medium mb-2">Areas of Improvement</p>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      {review.areas_of_improvement}
                    </p>
                  </div>
                )}

                {review.goals && (
                  <div>
                    <p className="text-sm font-medium mb-2">Goals for Next Cycle</p>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      {review.goals}
                    </p>
                  </div>
                )}

                {review.comments && (
                  <div>
                    <p className="text-sm font-medium mb-2">Additional Comments</p>
                    <p className="text-sm text-muted-foreground bg-muted p-3 rounded-md">
                      {review.comments}
                    </p>
                  </div>
                )}

                {review.status !== 'acknowledged' && (
                  <Button onClick={() => acknowledgeReview(review.id)} className="mt-4">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Acknowledge Review
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
