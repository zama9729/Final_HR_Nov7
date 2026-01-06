import { useEffect, useState } from 'react';
import { AvatarImage } from '@/components/ui/avatar';
import { api } from '@/lib/api';

interface ProfilePictureProps {
  userId: string;
  src?: string;
  className?: string;
  alt?: string;
}

/**
 * ProfilePicture component that automatically converts storage URLs (MinIO/AWS S3) to presigned URLs
 * This ensures profile pictures are accessible even when storage buckets are not publicly readable.
 * 
 * MIGRATION NOTE: Now supports both MinIO and AWS S3 URLs.
 *
 * Behaviour:
 * - If only userId is provided, it will fetch the latest profile picture URL from the API.
 * - If userId + src are provided, it will:
 *   - use src directly for non-storage URLs
 *   - fetch a presigned URL for MinIO/AWS S3 URLs.
 * - Handles image load errors gracefully by clearing the URL to show fallback avatar.
 */
export function ProfilePicture({ userId, src, className, alt }: ProfilePictureProps) {
  const [presignedUrl, setPresignedUrl] = useState<string | undefined>(src);
  const [loading, setLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    // Reset error state when userId or src changes
    setImageError(false);
    
    // If we have no user, just mirror src (or undefined)
    if (!userId) {
      setPresignedUrl(src);
      return;
    }

    // If no src was provided, always try to fetch the current profile picture URL
    if (!src) {
      const fetchByUserOnly = async () => {
        try {
          setLoading(true);
          const result = await api.getProfilePictureUrl(userId);
          setPresignedUrl(result?.url || undefined);
        } catch (error: any) {
          const errorMsg = error?.message || '';
          const isNotFound =
            errorMsg.includes('not found') ||
            errorMsg.includes('404') ||
            errorMsg.includes('No profile picture') ||
            errorMsg.includes('access denied');

          if (!isNotFound) {
            console.error('Failed to get profile picture URL:', error);
          }

          // If no profile picture exists, clear any URL so AvatarFallback shows
          setPresignedUrl(undefined);
        } finally {
          setLoading(false);
        }
      };

      fetchByUserOnly();
      return;
    }

    // When src exists, only fetch presigned URL if it looks like a MinIO or AWS S3 URL
    // MIGRATION NOTE: Now supports both MinIO and AWS S3 URLs
    const isStorageUrl =
      src.includes('localhost:9000') ||
      src.includes('minio') ||
      src.includes('amazonaws.com') ||
      src.includes('s3.') ||
      src.includes('/docshr/') ||
      src.includes('/hr-onboarding-docs/') ||
      src.includes('/hr-docs/') ||
      (src.startsWith('http://') && (src.includes(':9000') || src.includes('minio'))) ||
      (src.startsWith('https://') && src.includes('amazonaws.com'));

    if (!isStorageUrl) {
      setPresignedUrl(src);
      return;
    }

    const fetchPresignedUrl = async () => {
      try {
        setLoading(true);
        const result = await api.getProfilePictureUrl(userId);
        if (result?.url) {
          setPresignedUrl(result.url);
        } else {
          setPresignedUrl(src);
        }
      } catch (error: any) {
        const errorMsg = error?.message || '';
        const isNotFound =
          errorMsg.includes('not found') ||
          errorMsg.includes('404') ||
          errorMsg.includes('No profile picture') ||
          errorMsg.includes('access denied');

        if (!isNotFound) {
          console.error('Failed to get presigned URL for profile picture:', error);
        }

        if (errorMsg.includes('No profile picture')) {
          setPresignedUrl(undefined);
        } else {
          // Try to use the original src as fallback
          setPresignedUrl(src);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPresignedUrl();
  }, [userId, src]);

  // Handle image load errors by clearing the URL
  useEffect(() => {
    if (!presignedUrl) return;
    
    const img = new Image();
    img.onerror = () => {
      console.warn('Profile picture failed to load:', presignedUrl);
      setImageError(true);
      setPresignedUrl(undefined);
    };
    img.onload = () => {
      setImageError(false);
    };
    img.src = presignedUrl;
  }, [presignedUrl]);

  if (loading) {
    // Return a placeholder while loading
    return null;
  }

  // If image errored or no URL, return null so AvatarFallback shows
  if (imageError || !presignedUrl) {
    return null;
  }

  return <AvatarImage src={presignedUrl} className={className} alt={alt} />;
}

