"use client";

import { useRef } from "react";

type Props = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export default function TimeInput({ className, ...props }: Props) {
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      {...props}
      ref={ref}
      type="time"
      className={className}
      onClick={() => {
        try {
          ref.current?.showPicker();
        } catch {
          // showPicker() not supported — browser opens picker natively on focus
        }
      }}
    />
  );
}
