-- Migration: Add MinIO/S3 storage support for onboarding documents
-- Adds fields for presigned URL uploads, checksums, and verification status

-- Add missing columns to onboarding_documents for MinIO support
ALTER TABLE onboarding_documents
    ADD COLUMN IF NOT EXISTS object_key TEXT,
    ADD COLUMN IF NOT EXISTS checksum TEXT,
    ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'denied')),
    ADD COLUMN IF NOT EXISTS size_bytes BIGINT;

-- Create hr_documents table for HR document management (alternative view/table)
-- This table stores metadata for documents stored in MinIO
CREATE TABLE IF NOT EXISTS hr_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    object_key TEXT NOT NULL,
    filename TEXT,
    content_type TEXT,
    size_bytes BIGINT,
    uploaded_by UUID REFERENCES profiles(id),
    uploaded_at TIMESTAMPTZ DEFAULT now(),
    checksum TEXT,
    verified BOOLEAN DEFAULT FALSE,
    verification_status TEXT DEFAULT 'pending' CHECK (verification_status IN ('pending', 'approved', 'denied')),
    hr_notes TEXT,
    verified_by UUID REFERENCES profiles(id),
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_hr_documents_employee ON hr_documents(employee_id);
CREATE INDEX IF NOT EXISTS idx_hr_documents_verification_status ON hr_documents(verification_status);
CREATE INDEX IF NOT EXISTS idx_hr_documents_object_key ON hr_documents(object_key);
CREATE INDEX IF NOT EXISTS idx_onboarding_documents_object_key ON onboarding_documents(object_key);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_hr_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_hr_documents_updated_at ON hr_documents;
CREATE TRIGGER trigger_update_hr_documents_updated_at
    BEFORE UPDATE ON hr_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_hr_documents_updated_at();

-- Add audit logging for hr_documents
CREATE TABLE IF NOT EXISTS hr_document_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID REFERENCES hr_documents(id) ON DELETE CASCADE NOT NULL,
    actor_id UUID REFERENCES profiles(id),
    action TEXT NOT NULL,
    comment TEXT,
    previous_status TEXT,
    next_status TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hr_document_audit_document ON hr_document_audit_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_hr_document_audit_actor ON hr_document_audit_logs(actor_id);

