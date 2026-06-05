import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "Inklee — booking requests without the DM chaos";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        background: "#0E0E10",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "80px",
      }}
    >
      <div
        style={{
          fontSize: "80px",
          fontWeight: 600,
          color: "#E8E1D4",
          letterSpacing: "-0.04em",
          marginBottom: "20px",
          fontFamily: "serif",
        }}
      >
        inklee
      </div>
      <div
        style={{
          fontSize: "30px",
          color: "rgba(232, 225, 212, 0.55)",
          letterSpacing: "-0.01em",
          fontFamily: "sans-serif",
        }}
      >
        booking requests without the dm chaos
      </div>
    </div>,
    { ...size },
  );
}
