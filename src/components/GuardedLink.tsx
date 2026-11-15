import type { ReactNode } from 'react';
import { Link, useInRouterContext, useNavigate } from 'react-router-dom';

interface GuardedLinkProps {
  to: string;
  className?: string;
  title?: string;
  onBeforeNavigate: (proceed: () => void) => void;
  children: ReactNode;
}

function RouterGuardedLink({ to, className, title, onBeforeNavigate, children }: GuardedLinkProps) {
  const navigate = useNavigate();
  return (
    <Link
      to={to}
      className={className}
      title={title}
      onClick={(e) => {
        e.preventDefault();
        onBeforeNavigate(() => navigate(to));
      }}
    >
      {children}
    </Link>
  );
}

/**
 * رابط تنقل إلى مستند مرتبط يتحقق من التعديلات غير المحفوظة قبل مغادرة النموذج الحالي.
 */
export default function GuardedLink(props: GuardedLinkProps) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <RouterGuardedLink {...props} />;
  }
  return (
    <a
      href={props.to}
      className={props.className}
      title={props.title}
      onClick={(e) => {
        e.preventDefault();
        props.onBeforeNavigate(() => {});
      }}
    >
      {props.children}
    </a>
  );
}
