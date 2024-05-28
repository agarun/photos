import Link from 'next/link';
import cn from 'classnames';

export const ExternalLink: React.FC<{
  children: React.ReactNode;
  href: string;
  className?: string;
}> = ({ href, children, className, ...props }) => {
  return (
    <Link
      target="_blank"
      rel="noopener noreferrer"
      href={href}
      className={cn('hover:text-gray-500', className)}
      {...props}
    >
      {children}
    </Link>
  );
};
