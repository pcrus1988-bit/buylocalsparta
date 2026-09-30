"use client";

import { AdminWorkspaceError } from "../../../components/AdminWorkspaceError";

export default function Error({ reset }: Readonly<{ error: Error & { digest?: string }; reset: () => void }>) {
  return <AdminWorkspaceError title="Quick Add" reset={reset}/>;
}
