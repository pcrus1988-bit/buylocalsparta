import type { CSSProperties, ReactNode } from "react";

const shellStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 2147482000,
  boxSizing: "border-box",
  overflowX: "hidden",
  overflowY: "auto",
  overscrollBehavior: "contain",
  isolation: "isolate"
};

export function OperationalFullscreenShell({
  children,
  background = "#f2f1ec"
}: Readonly<{
  children: ReactNode;
  background?: string;
}>) {
  return <div data-operational-fullscreen="true" style={{ ...shellStyle, background }}>
    {children}
  </div>;
}
