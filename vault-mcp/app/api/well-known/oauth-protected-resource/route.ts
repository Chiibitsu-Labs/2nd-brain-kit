export async function GET(req: Request) {
  const origin = new URL(req.url).origin;
  return Response.json({
    resource: `${origin}/api/mcp`,
    authorization_servers: [origin],
  });
}
