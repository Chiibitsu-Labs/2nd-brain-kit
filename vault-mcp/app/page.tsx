// Static success screen shown at the deployment root. Vercel's post-deploy
// "Congratulations!" screen previews this URL — without it, that preview
// was a bare 404, which non-technical testers read as the deploy having
// failed. Deliberately static and hardcoded: no env vars, no repo/owner
// info, nothing from the vault. Not gated behind auth — it carries no
// vault content, so there's nothing here to protect.
export default function Home() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: "0.75rem",
        padding: "2rem",
        textAlign: "center",
        backgroundColor: "#0b0b0f",
        color: "#f5f5f5",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
      }}
    >
      <h1 style={{ fontSize: "1.75rem", fontWeight: 600, margin: 0 }}>
        Your second brain is live ✓
      </h1>
      <p
        style={{
          fontSize: "1rem",
          color: "#a3a3ad",
          margin: 0,
          maxWidth: "32rem",
        }}
      >
        Next step: go back to the setup guide and connect it to Claude or
        ChatGPT.
      </p>
      <footer style={{ marginTop: "3rem", fontSize: "0.8rem", color: "#6b6b74" }}>
        Second Brain Kit by Chiibitsu Labs
      </footer>
    </main>
  );
}
