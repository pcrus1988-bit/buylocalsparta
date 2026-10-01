"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

type Props = Readonly<{
  value: 10 | 20 | 50 | 100;
}>;

export function AdminMailPageSizeSelect({ value }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const changePageSize = (nextValue: string) => {
    const params = new URLSearchParams(window.location.search);
    params.set("pageSize", nextValue);
    params.delete("page");
    params.delete("message");
    startTransition(() => router.push(`/admin/mail?${params.toString()}`));
  };

  return <label className="admin-mail-page-size-select">
    <span>Rows per page</span>
    <select
      aria-label="Rows per page"
      value={String(value)}
      disabled={pending}
      onChange={(event) => changePageSize(event.currentTarget.value)}
    >
      <option value="10">10</option>
      <option value="20">20</option>
      <option value="50">50</option>
      <option value="100">100</option>
    </select>
  </label>;
}
