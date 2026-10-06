import { useEffect, useState } from "react";

import "./ThemeControl.css";

export function ThemeControl() {
  const [preference, setPreference] = useState(
    () => document.documentElement.dataset.themePreference || "system",
  );

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme =
        preference === "system"
          ? media.matches
            ? "dark"
            : "light"
          : preference;
      document.documentElement.dataset.theme = theme;
      document.documentElement.dataset.themePreference = preference;
      document.querySelector<HTMLMetaElement>(
        'meta[name="theme-color"]',
      )!.content = theme === "dark" ? "#191813" : "#f6f5f1";
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [preference]);

  function choose(next: string) {
    setPreference(next);
    try {
      localStorage.setItem("fieldwork-theme", next);
    } catch {
      // The selection still works for this visit without storage.
    }
  }

  return (
    <div className="theme-control" role="radiogroup" aria-label="Theme">
      {["system", "light", "dark"].map((value) => {
        const label = `${value[0].toUpperCase()}${value.slice(1)} theme`;
        return (
          <label className="theme-option" key={value} title={label}>
            <input
              type="radio"
              name="theme-preference"
              value={value}
              checked={preference === value}
              onChange={() => choose(value)}
              aria-label={label}
            />
            <span className="theme-option-icon">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                {value === "system" && (
                  <>
                    <rect x="3" y="4" width="18" height="13" rx="2" />
                    <path d="M8 21h8M12 17v4" />
                  </>
                )}
                {value === "light" && (
                  <>
                    <circle cx="12" cy="12" r="4" />
                    <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
                  </>
                )}
                {value === "dark" && (
                  <path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z" />
                )}
              </svg>
            </span>
          </label>
        );
      })}
    </div>
  );
}
