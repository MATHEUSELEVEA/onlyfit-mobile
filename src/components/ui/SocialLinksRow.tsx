import {
  SOCIAL_PLATFORMS,
  socialLinkHref,
  type SocialLinks,
  type SocialPlatform,
} from '@/lib/socialLinks';

function BrandIcon({ platform }: { platform: SocialPlatform }) {
  const pathClass = 'fill-current';

  switch (platform) {
    case 'instagram':
      return (
        <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" aria-hidden>
          <path
            className={pathClass}
            d="M7.75 2h8.5A5.76 5.76 0 0 1 22 7.75v8.5A5.76 5.76 0 0 1 16.25 22h-8.5A5.76 5.76 0 0 1 2 16.25v-8.5A5.76 5.76 0 0 1 7.75 2Zm0 2A3.75 3.75 0 0 0 4 7.75v8.5A3.75 3.75 0 0 0 7.75 20h8.5A3.75 3.75 0 0 0 20 16.25v-8.5A3.75 3.75 0 0 0 16.25 4h-8.5ZM12 7.25A4.75 4.75 0 1 1 12 16.75 4.75 4.75 0 0 1 12 7.25Zm0 2A2.75 2.75 0 1 0 12 14.75 2.75 2.75 0 0 0 12 9.25Zm5.25-2.35a1.15 1.15 0 1 1-2.3 0 1.15 1.15 0 0 1 2.3 0Z"
          />
        </svg>
      );
    case 'youtube':
      return (
        <svg viewBox="0 0 24 24" className="h-[23px] w-[23px]" aria-hidden>
          <path
            className={pathClass}
            d="M23.5 6.2a3.02 3.02 0 0 0-2.13-2.14C19.49 3.56 12 3.56 12 3.56s-7.49 0-9.37.5A3.02 3.02 0 0 0 .5 6.2C0 8.08 0 12 0 12s0 3.92.5 5.8a3.02 3.02 0 0 0 2.13 2.14c1.88.5 9.37.5 9.37.5s7.49 0 9.37-.5a3.02 3.02 0 0 0 2.13-2.14c.5-1.88.5-5.8.5-5.8s0-3.92-.5-5.8ZM9.55 15.57V8.43L15.82 12l-6.27 3.57Z"
          />
        </svg>
      );
    case 'twitter':
      return (
        <svg viewBox="0 0 24 24" className="h-[19px] w-[19px]" aria-hidden>
          <path
            className={pathClass}
            d="M18.24 2H21.9l-7.99 9.13L23.31 22h-7.36l-5.76-6.96L3.6 22H.02l8.55-9.77L-.44 2h7.54l5.21 6.24L18.24 2Zm-1.28 18.08h2.03L6 3.82H3.82l13.14 16.26Z"
          />
        </svg>
      );
    case 'tiktok':
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
          <path
            className={pathClass}
            d="M16.6 2c.25 2.08 1.42 3.73 3.46 4.3.53.15 1.08.22 1.63.23v3.73a8.13 8.13 0 0 1-4.88-1.56v6.86c0 3.58-2.91 6.49-6.49 6.49a6.49 6.49 0 0 1-1.23-12.86c.4-.08.81-.12 1.23-.12.33 0 .65.03.96.08v3.9a2.66 2.66 0 1 0 1.88 2.54V2h3.44Z"
          />
        </svg>
      );
    case 'whatsapp':
      return (
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" aria-hidden>
          <path
            className={pathClass}
            d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.16-.17.2-.35.22-.64.08-.3-.15-1.26-.46-2.39-1.48-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2.01-1.41.25-.69.25-1.29.17-1.41-.07-.13-.27-.2-.57-.35ZM12.05 21.79h-.01a9.88 9.88 0 0 1-5.03-1.38l-.36-.21-3.74.98 1-3.65-.24-.37a9.86 9.86 0 0 1-1.51-5.26C2.16 6.45 6.6 2.02 12.05 2.02c2.64 0 5.12 1.03 6.99 2.9a9.83 9.83 0 0 1 2.89 6.99c0 5.45-4.44 9.88-9.88 9.88Zm8.41-18.3A11.82 11.82 0 0 0 12.05 0C5.5 0 .16 5.34.16 11.89c0 2.1.55 4.14 1.59 5.95L.06 24l6.3-1.65a11.88 11.88 0 0 0 5.68 1.45h.01c6.55 0 11.89-5.34 11.89-11.9a11.82 11.82 0 0 0-3.48-8.41Z"
          />
        </svg>
      );
    case 'linkedin':
      return (
        <svg viewBox="0 0 24 24" className="h-[21px] w-[21px]" aria-hidden>
          <path
            className={pathClass}
            d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.86 0-2.14 1.45-2.14 2.94v5.67H9.34V8.98h3.41v1.57h.05a3.74 3.74 0 0 1 3.37-1.85c3.61 0 4.28 2.38 4.28 5.47v6.28ZM5.32 7.41a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13Zm1.78 13.04H3.53V8.98H7.1v11.47ZM22.23 0H1.77C.79 0 0 .77 0 1.72v20.56C0 23.23.79 24 1.77 24h20.46c.98 0 1.77-.77 1.77-1.72V1.72C24 .77 23.21 0 22.23 0Z"
          />
        </svg>
      );
  }
}

export function SocialLinksRow({ links, className = '' }: { links: SocialLinks; className?: string }) {
  const visible = SOCIAL_PLATFORMS
    .map((platform) => ({ ...platform, value: links[platform.key] }))
    .filter((item): item is typeof item & { value: string } => Boolean(item.value?.trim()));

  if (!visible.length) return null;

  return (
    <div className={`flex flex-wrap items-center justify-center gap-2.5 ${className}`}>
      {visible.map((item) => (
        <a
          key={item.key}
          href={socialLinkHref(item.key, item.value)}
          target="_blank"
          rel="noreferrer"
          aria-label={item.label}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-outline-variant/35 bg-surface-container-lowest/80 text-on-surface shadow-sm backdrop-blur-md transition-colors active:bg-surface-container-high"
        >
          <BrandIcon platform={item.key} />
        </a>
      ))}
    </div>
  );
}
