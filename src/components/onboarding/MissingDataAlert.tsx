import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertCircle, CheckCircle2, FileText, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';

interface MissingDataAlertProps {
  missingFields: string[];
  missingDocuments: string[];
  hasMissingData: boolean;
  message?: string | null;
  onDismiss?: () => void;
}

const fieldLabels: Record<string, string> = {
  full_legal_name: 'Full Legal Name',
  date_of_birth: 'Date of Birth',
  nationality: 'Nationality',
  personal_phone: 'Personal Phone',
  personal_email: 'Personal Email',
  pan_number: 'PAN Number',
  aadhar_number: 'Aadhaar Number',
  permanent_address: 'Permanent Address',
  current_address: 'Current Address',
  emergency_contact_name: 'Emergency Contact Name',
  emergency_contact_phone: 'Emergency Contact Phone',
};

const documentLabels: Record<string, string> = {
  RESUME: 'Resume',
  EDUCATION_CERT: 'Education Certificates',
  EXPERIENCE_LETTER: 'Experience Letters',
  ID_PROOF: 'ID Proof',
  BG_CHECK_DOC: 'Background Check Documents',
  SIGNED_CONTRACT: 'Signed Contract',
};

export function MissingDataAlert({
  missingFields,
  missingDocuments,
  hasMissingData,
  message,
  onDismiss,
}: MissingDataAlertProps) {
  const navigate = useNavigate();

  if (!hasMissingData) {
    return null;
  }

  const handleGoToOnboarding = () => {
    navigate('/onboarding');
  };

  return (
    <Alert className="mb-6 border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
      <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-500" />
      <AlertTitle className="text-amber-900 dark:text-amber-100">
        Complete Your Onboarding
      </AlertTitle>
      <AlertDescription className="mt-2 space-y-3">
        {message && (
          <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
        )}

        {missingFields.length > 0 && (
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
              Missing Information:
            </p>
            <div className="flex flex-wrap gap-2">
              {missingFields.map((field) => (
                <Badge
                  key={field}
                  variant="outline"
                  className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200"
                >
                  {fieldLabels[field] || field.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {missingDocuments.length > 0 && (
          <div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-100 mb-2">
              Missing Documents:
            </p>
            <div className="flex flex-wrap gap-2">
              {missingDocuments.map((doc) => (
                <Badge
                  key={doc}
                  variant="outline"
                  className="border-amber-300 text-amber-800 dark:border-amber-700 dark:text-amber-200"
                >
                  <FileText className="h-3 w-3 mr-1" />
                  {documentLabels[doc] || doc.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleGoToOnboarding}
            size="sm"
            className="bg-amber-600 hover:bg-amber-700 text-white"
          >
            <Upload className="h-4 w-4 mr-2" />
            Complete Onboarding
          </Button>
          {onDismiss && (
            <Button
              onClick={onDismiss}
              size="sm"
              variant="outline"
              className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-200"
            >
              Dismiss
            </Button>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}

