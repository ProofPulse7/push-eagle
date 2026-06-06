import { useEffect } from "react";

type ExternalRedirectProps = {
  url: string;
};

export function ExternalRedirect({ url }: ExternalRedirectProps) {
  useEffect(() => {
    const target = window.top ?? window;
    target.location.href = url;
  }, [url]);

  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
        fontFamily: "Inter, system-ui, sans-serif",
        height: "100vh",
        justifyContent: "center",
        margin: 0,
      }}
    >
      <p>Opening Push Eagle dashboard…</p>
    </div>
  );
}
