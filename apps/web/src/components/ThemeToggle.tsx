"use client";

import { useState } from "react";
import { Moon, Sun } from "lucide-react";

export default function ThemeToggle() {
  // layout.tsx sets html.dark by default, so initial state is always true
  const [isDark, setIsDark] = useState(true);

  function toggle() {
    const html = document.documentElement;
    if (html.classList.contains("dark")) {
      html.classList.remove("dark");
      setIsDark(false);
    } else {
      html.classList.add("dark");
      setIsDark(true);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? "switch to light mode" : "switch to dark mode"}
      className="p-2 rounded-md text-muted-foreground hover:text-foreground transition-colors"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
