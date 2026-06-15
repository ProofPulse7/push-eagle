import { redirect } from 'next/navigation';

const ROOT_APP_URL = (process.env.SHOPIFY_ROOT_APP_URL || 'https://push-eagle.vercel.app').replace(
  /\/$/,
  '',
);

type LoginPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const shop = Array.isArray(params.shop) ? params.shop[0] : params.shop;

  if (shop) {
    const connectUrl = new URL(`${ROOT_APP_URL}/app`);
    connectUrl.searchParams.set('shop', shop);
    const host = Array.isArray(params.host) ? params.host[0] : params.host;
    if (host) {
      connectUrl.searchParams.set('host', host);
    }
    redirect(connectUrl.toString());
  }

  redirect(`${ROOT_APP_URL}/`);
}
