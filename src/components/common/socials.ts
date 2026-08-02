import type { ComponentType } from 'react';
import { Instagram, Facebook, Youtube, Linkedin } from 'lucide-react';
import { XIcon, WhatsAppIcon, SnapchatIcon, ThreadsIcon } from './BrandIcons';

export type SocialIcon = ComponentType<{ className?: string }>;

export interface Social {
  label: string;
  href: string;
  Icon: SocialIcon;
}

// OneHook social handles — single source of truth (all use the `onehook.club`
// handle). Shared by the site footer and the redeem-invite screen.
export const SOCIALS: Social[] = [
  { label: 'Instagram', href: 'https://instagram.com/onehook.club', Icon: Instagram },
  { label: 'Facebook', href: 'https://facebook.com/onehook.club', Icon: Facebook },
  { label: 'X', href: 'https://x.com/onehookclub', Icon: XIcon },
  { label: 'Threads', href: 'https://threads.net/@onehook.club', Icon: ThreadsIcon },
  { label: 'YouTube', href: 'https://www.youtube.com/@onehookclub', Icon: Youtube },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/company/onehook/', Icon: Linkedin },
  { label: 'WhatsApp', href: 'https://wa.me/onehook.club', Icon: WhatsAppIcon },
  { label: 'Snapchat', href: 'https://snapchat.com/add/onehook.club', Icon: SnapchatIcon },
];
