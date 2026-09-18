"use client";

type RoleAccessButtonProps = Readonly<{
  destination: "/login" | "/vendor/login" | "/driver/login";
  children: React.ReactNode;
  className?: string;
}>;

export function RoleAccessButton({ destination, children, className = "button" }: RoleAccessButtonProps) {
  return <button
    type="button"
    className={className}
    onClick={() => window.location.assign(destination)}
  >
    {children}
  </button>;
}
