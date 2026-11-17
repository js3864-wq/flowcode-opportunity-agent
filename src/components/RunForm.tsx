"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RunForm({ initial = "" }: { initial?: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  return (
    <form
      className="flex flex-col gap-3 sm:flex-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) router.push(`/run?company=${encodeURIComponent(value.trim())}`);
      }}
    >
      <label htmlFor="company" className="sr-only">
        Company name or website
      </label>
      <input
        id="company"
        name="company"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Company name or website, e.g. f1lasvegasgp.com"
        className="min-w-0 flex-1 rounded-md border border-line bg-paper px-4 py-2.5 text-base placeholder:text-muted/80 focus:border-ink focus:outline-none"
        autoComplete="off"
      />
      <button type="submit" className="rounded-md bg-ink px-5 py-2.5 font-medium text-paper hover:bg-ink/85 disabled:opacity-50" disabled={!value.trim()}>
        Start research
      </button>
    </form>
  );
}
