import { useId, type ReactNode } from 'react';

export default function HomeSection({ title, children }: { title: string; children: ReactNode }) {
  const headingId = useId();
  return (
    <section className="home-section" aria-labelledby={headingId}>
      <h2 id={headingId} className="home-section-title">{title}</h2>
      {children}
    </section>
  );
}
