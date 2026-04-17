export async function GET() {
  console.log("✅ Engine route hit");

  return Response.json({
    success: true,
    message: "Engine is running"
  });
}