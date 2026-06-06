import { useLayoutEffect } from "react";

type ExternalRedirectProps = {
  url: string;
};

export function ExternalRedirect({ url }: ExternalRedirectProps) {
  useLayoutEffect(() => {
    const target = window.top ?? window;
    target.location.replace(url);
  }, [url]);

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        flexDirection: "column",
        fontFamily: "Inter, system-ui, sans-serif",
        gap: "12px",
        height: "100vh",
        justifyContent: "center",
        margin: 0,
      }}
    >
      <p>Opening Push Eagle dashboard…</p>
      <a href={url} target="_top" rel="noopener noreferrer">
        Continue to dashboard
      </a>
    </div>
  );
}
