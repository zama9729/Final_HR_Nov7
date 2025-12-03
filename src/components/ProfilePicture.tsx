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
 * This ensures profile pictures are accessible even when MinIO buckets are not publicly readable
 */
export function ProfilePicture({ userId, src, className, alt }: ProfilePictureProps) {
  const [presignedUrl, setPresignedUrl] = useState<string | undefined>(src);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Only fetch presigned URL if:
    // 1. We have a userId
    // 2. We have a src URL
    // 3. The URL is a MinIO URL (contains localhost:9000 or minio)
    if (!userId || !src) {
      setPresignedUrl(src);
      return;
    }

    // Check if it's a MinIO URL that needs presigning
    const isMinIOUrl = src.includes('localhost:9000') || 
                       src.includes('minio') || 
                       src.includes('/docshr/') || 
                       src.includes('/hr-onboarding-docs/') ||
                       src.startsWith('http://') && (src.includes(':9000') || src.includes('minio'));
    
    if (!isMinIOUrl) {
      // Not a MinIO URL, use as-is
      setPresignedUrl(src);
      return;
    }

    // Fetch presigned URL
    const fetchPresignedUrl = async () => {
      try {
        setLoading(true);
        const result = await api.getProfilePictureUrl(userId);
        if (result?.url) {
          setPresignedUrl(result.url);
        } else {
          setPresignedUrl(src); // Fallback to original URL
        }
      } catch (error) {
        console.error('Failed to get presigned URL for profile picture:', error);
        setPresignedUrl(src); // Fallback to original URL
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

