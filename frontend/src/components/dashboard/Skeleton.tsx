// Reusable shimmering placeholder block used by loading states.
export const Skeleton = ({ className = '' }: { className?: string }) => (
  <div className={`animate-pulse rounded-md bg-muted/60 ${className}`} />
);

export default Skeleton;