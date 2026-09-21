import type { Metadata, Viewport } from "next";
import "./globals.css";
import PwaRegister from "../components/PwaRegister";

export const metadata: Metadata = {
  title: "EarthDance Radar",
  description: "Encontre sua galera, sua barraca e o caminho de volta no Earthdance RS 2026.",
  applicationName: "EarthDance Radar",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "EarthDance Radar", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#07110d",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaRegister />
        {children}
      </body>
    </html>
  );
}
