import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";
import { CheckCircle, Mail, Phone, MapPin, FileText, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

type VerificationStatus = 'pending' | 'sent' | 'verified' | 'failed';

interface VerificationState {
  email: VerificationStatus;
  phone: VerificationStatus;
  address: VerificationStatus;
}

export default function OffboardingNew() {
  const { toast } = useToast();
  const [step, setStep] = useState<'verification' | 'survey' | 'complete'>('verification');
  const [loading, setLoading] = useState(false);
  const [maskedInfo, setMaskedInfo] = useState<any>(null);
  const [verification, setVerification] = useState<VerificationState>({
    email: 'pending',
    phone: 'pending',
    address: 'pending',
  });
  const [otp, setOtp] = useState({ email: '', phone: '' });
  const [address, setAddress] = useState({
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: '',
  });
  const [survey, setSurvey] = useState({
    experience_rating: 3,
    culture_feedback: '',
    manager_feedback: '',
    compensation_feedback: '',
    rehire_willingness: false,
  });
  const [reason, setReason] = useState('');

  useEffect(() => {
    loadMaskedInfo();
  }, []);

  const loadMaskedInfo = async () => {
    try {
      const data = await api.getMaskedVerification();
      setMaskedInfo(data);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to load verification info",
        variant: "destructive",
      });
    }
  };

  const sendOTP = async (type: 'email' | 'phone') => {
    try {
      setLoading(true);
      await api.sendVerificationOTP(type);
      setVerification(prev => ({ ...prev, [type]: 'sent' }));
      toast({
        title: "OTP Sent",
        description: `OTP sent to ${type}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to send ${type} OTP`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmOTP = async (type: 'email' | 'phone') => {
    if (!otp[type]) {
      toast({
        title: "Error",
        description: "Please enter OTP",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await api.confirmVerification(type, otp[type]);
      setVerification(prev => ({ ...prev, [type]: 'verified' }));
      setOtp(prev => ({ ...prev, [type]: '' }));
      toast({
        title: "Success",
        description: `${type} verified successfully`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || `Failed to verify ${type}`,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const confirmAddress = async () => {
    if (!address.address_line1 || !address.city || !address.state || !address.postal_code) {
      toast({
        title: "Error",
        description: "Please fill all required address fields",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await api.confirmAddress({ ...address, confirmed: true });
      setVerification(prev => ({ ...prev, address: 'verified' }));
      toast({
        title: "Success",
        description: "Address confirmed successfully",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to confirm address",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSurvey = async () => {
    if (!reason.trim()) {
      toast({
        title: "Error",
        description: "Please provide a reason for leaving",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      await api.submitOffboardingSurvey({
        survey_json: survey,
        reason,
      });
      setStep('complete');
      toast({
        title: "Success",
        description: "Resignation submitted successfully. Pending approvals.",
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message || "Failed to submit resignation",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const canProceedToSurvey = verification.email === 'verified' && 
                               verification.phone === 'verified' && 
                               verification.address === 'verified';

  if (step === 'complete') {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Resignation Submitted</CardTitle>
              <CardDescription>Your resignation request has been submitted successfully</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Your resignation request is now pending approval from your Manager, HR, and CEO (if applicable).
                  You will be notified once a decision is made.
                </AlertDescription>
              </Alert>
              <Button onClick={() => window.location.href = '/offboarding'}>
                View My Offboarding Status
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold">Request Resignation</h1>
          <p className="text-muted-foreground">Complete verification and submit your resignation</p>
        </div>

        {step === 'verification' && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Step 1: Verify Your Identity</CardTitle>
                <CardDescription>Please verify your email, phone, and address before proceeding</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Email Verification */}
                <div className="space-y-2">
                  <Label>Email Verification</Label>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    <span className="font-mono">{maskedInfo?.masked_email || 'Loading...'}</span>
                    {verification.email === 'verified' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  {verification.email !== 'verified' && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => sendOTP('email')}
                        disabled={loading || verification.email === 'sent'}
                      >
                        {verification.email === 'sent' ? 'OTP Sent' : 'Send OTP'}
                      </Button>
                      {verification.email === 'sent' && (
                        <>
                          <Input
                            type="text"
                            placeholder="Enter OTP"
                            value={otp.email}
                            onChange={(e) => setOtp(prev => ({ ...prev, email: e.target.value }))}
                            className="max-w-[150px]"
                          />
                          <Button size="sm" onClick={() => confirmOTP('email')} disabled={loading}>
                            Verify
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Phone Verification */}
                <div className="space-y-2">
                  <Label>Phone Verification</Label>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    <span className="font-mono">{maskedInfo?.masked_phone || 'Loading...'}</span>
                    {verification.phone === 'verified' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  {verification.phone !== 'verified' && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => sendOTP('phone')}
                        disabled={loading || verification.phone === 'sent'}
                      >
                        {verification.phone === 'sent' ? 'OTP Sent' : 'Send OTP'}
                      </Button>
                      {verification.phone === 'sent' && (
                        <>
                          <Input
                            type="text"
                            placeholder="Enter OTP"
                            value={otp.phone}
                            onChange={(e) => setOtp(prev => ({ ...prev, phone: e.target.value }))}
                            className="max-w-[150px]"
                          />
                          <Button size="sm" onClick={() => confirmOTP('phone')} disabled={loading}>
                            Verify
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Address Confirmation */}
                <div className="space-y-2">
                  <Label>Address Confirmation</Label>
                  <div className="flex items-center gap-2 mb-2">
                    <MapPin className="h-4 w-4" />
                    {verification.address === 'verified' && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                  {verification.address !== 'verified' && (
                    <div className="space-y-2">
                      <Input
                        placeholder="Address Line 1"
                        value={address.address_line1}
                        onChange={(e) => setAddress(prev => ({ ...prev, address_line1: e.target.value }))}
                      />
                      <Input
                        placeholder="Address Line 2"
                        value={address.address_line2}
                        onChange={(e) => setAddress(prev => ({ ...prev, address_line2: e.target.value }))}
                      />
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="City"
                          value={address.city}
                          onChange={(e) => setAddress(prev => ({ ...prev, city: e.target.value }))}
                        />
                        <Input
                          placeholder="State"
                          value={address.state}
                          onChange={(e) => setAddress(prev => ({ ...prev, state: e.target.value }))}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          placeholder="Postal Code"
                          value={address.postal_code}
                          onChange={(e) => setAddress(prev => ({ ...prev, postal_code: e.target.value }))}
                        />
                        <Input
                          placeholder="Country"
                          value={address.country}
                          onChange={(e) => setAddress(prev => ({ ...prev, country: e.target.value }))}
                        />
                      </div>
                      <Button onClick={confirmAddress} disabled={loading}>
                        Confirm Address
                      </Button>
                    </div>
                  )}
                </div>

                {canProceedToSurvey && (
                  <Button onClick={() => setStep('survey')} className="w-full">
                    Proceed to Exit Survey
                  </Button>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {step === 'survey' && (
          <Card>
            <CardHeader>
              <CardTitle>Step 2: Exit Survey</CardTitle>
              <CardDescription>Please provide feedback on your experience</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>Overall Experience Rating (1-5)</Label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <Button
                      key={rating}
                      variant={survey.experience_rating === rating ? "default" : "outline"}
                      onClick={() => setSurvey(prev => ({ ...prev, experience_rating: rating }))}
                    >
                      {rating}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label>Culture Feedback</Label>
                <Textarea
                  placeholder="Share your thoughts on company culture..."
                  value={survey.culture_feedback}
                  onChange={(e) => setSurvey(prev => ({ ...prev, culture_feedback: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Manager Feedback</Label>
                <Textarea
                  placeholder="Share your thoughts on your manager..."
                  value={survey.manager_feedback}
                  onChange={(e) => setSurvey(prev => ({ ...prev, manager_feedback: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Compensation Feedback</Label>
                <Textarea
                  placeholder="Share your thoughts on compensation..."
                  value={survey.compensation_feedback}
                  onChange={(e) => setSurvey(prev => ({ ...prev, compensation_feedback: e.target.value }))}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Would you consider rejoining in the future?</Label>
                <div className="flex gap-4">
                  <Button
                    variant={survey.rehire_willingness ? "default" : "outline"}
                    onClick={() => setSurvey(prev => ({ ...prev, rehire_willingness: true }))}
                  >
                    Yes
                  </Button>
                  <Button
                    variant={!survey.rehire_willingness ? "default" : "outline"}
                    onClick={() => setSurvey(prev => ({ ...prev, rehire_willingness: false }))}
                  >
                    No
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason for Leaving *</Label>
                <Textarea
                  placeholder="Please provide the reason for your resignation..."
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  required
                />
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep('verification')}>
                  Back
                </Button>
                <Button onClick={handleSubmitSurvey} disabled={loading || !reason.trim()}>
                  Submit Resignation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}

