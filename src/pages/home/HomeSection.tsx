import { useId, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface HomeSectionProps {
  title: string;
  icon: LucideIcon;
  children: ReactNode;
}

export default function HomeSection({ title, icon: Icon, children }: HomeSectionProps) {
  const headingId = useId();
  return (
    <section className="home-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="home-section-title">
        <span className="home-section-icon" aria-hidden="true"><Icon size={17} /></span>
        {title}
      </h2>
      {children}
    </section>
  );
}
