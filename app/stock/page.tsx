import { permanentRedirect } from "next/navigation";

export default function DeprecatedStockPage() {
  permanentRedirect("/auto");
}
