import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { APP_CATALOG, type AppKey } from "@/config/apps";
import TryPage from "./TryPage";

interface Props {
  params: Promise<{ appKey: string }>;
}

const VALID_KEYS = new Set<string>(Object.keys(APP_CATALOG));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { appKey } = await params;
  if (!VALID_KEYS.has(appKey)) return { title: "Not Found" };

  const app = APP_CATALOG[appKey as AppKey];
  return {
    title: `Try ${app.name} — $1 for 7 days`,
    description: app.longDescription,
  };
}

export default async function TryAppPage({ params }: Props) {
  const { appKey } = await params;
  if (!VALID_KEYS.has(appKey)) notFound();

  const app = APP_CATALOG[appKey as AppKey];
  return <TryPage app={app} />;
}
