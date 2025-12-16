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
 * ProfilePicture component that automatically converts MinIO URLs to presigned URLs
 * This ensures profile pictures are accessible even when MinIO buckets are not publicly readable.
 *
 * Behaviour:
 * - If only userId is provided, it will fetch the latest profile picture URL from the API.
 * - If userId + src are provided, it will:
 *   - use src directly for non-MinIO URLs
 *   - fetch a presigned URL for MinIO URLs.
 */
export function ProfilePicture({ userId, src, className, alt }: ProfilePictureProps) {
  const [presignedUrl, setPresignedUrl] = useState<string | undefined>(src);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
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

    // When src exists, only fetch presigned URL if it looks like a MinIO URL
    const isMinIOUrl =
      src.includes('localhost:9000') ||
      src.includes('minio') ||
      src.includes('/docshr/') ||
      src.includes('/hr-onboarding-docs/') ||
      (src.startsWith('http://') && (src.includes(':9000') || src.includes('minio')));

    if (!isMinIOUrl) {
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
          setPresignedUrl(src);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchPresignedUrl();
  }, [userId, src]);

  if (loading) {
    // Return a placeholder while loading
    return null;
  }

  return <AvatarImage src={presignedUrl} className={className} alt={alt} />;
}

