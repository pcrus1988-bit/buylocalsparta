"use client";

import { useEffect, useRef, useState } from "react";

type Props = Readonly<{
  formId: string;
  totalOnPage: number;
}>;

export function AdminMailPageSelection({ formId, totalOnPage }: Props) {
  const [selectedCount, setSelectedCount] = useState(0);
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const selector = `input[data-admin-mail-select="true"][form="${formId}"]`;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(selector));

    const sync = () => {
      const count = inputs.filter((input) => input.checked).length;
      setSelectedCount(count);
      if (selectAllRef.current) {
        selectAllRef.current.checked = inputs.length > 0 && count === inputs.length;
        selectAllRef.current.indeterminate = count > 0 && count < inputs.length;
      }
    };

    inputs.forEach((input) => input.addEventListener("change", sync));
    sync();
    return () => inputs.forEach((input) => input.removeEventListener("change", sync));
  }, [formId, totalOnPage]);

  const setAll = (checked: boolean) => {
    const selector = `input[data-admin-mail-select="true"][form="${formId}"]`;
    const inputs = Array.from(document.querySelectorAll<HTMLInputElement>(selector));
    for (const input of inputs) {
      input.checked = checked;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };

  return <div className="admin-mail-page-selection">
    <label>
      <input
        ref={selectAllRef}
        type="checkbox"
        onChange={(event) => setAll(event.currentTarget.checked)}
        disabled={totalOnPage === 0}
        aria-label="Select all emails on this page"
      />
      <span>Select page</span>
    </label>
    <span className="admin-mail-selected-count">{selectedCount} selected</span>
    {selectedCount > 0 ? <button type="button" onClick={() => setAll(false)}>Clear</button> : null}
  </div>;
}
