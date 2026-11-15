import type { ReactNode } from 'react';

export default function CrtFrame({ children }: { children: ReactNode }) {
  return <div className="crt">{children}</div>;
}
