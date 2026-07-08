import Script from 'next/script';

const CRISP_WEBSITE_ID = 'bff5f4a5-d8a1-4cc8-bb0d-22330b97ae91';

/** Official Crisp embed snippet (https://help.crisp.chat/en/article/how-to-install-crisp-on-your-website-1sy8k0l/) */
export function CrispChatWidget() {
  return (
    <Script id="crisp-chat" strategy="beforeInteractive">
      {`window.$crisp=[];window.CRISP_WEBSITE_ID="${CRISP_WEBSITE_ID}";(function(){d=document;s=d.createElement("script");s.src="https://client.crisp.chat/l.js";s.async=1;d.getElementsByTagName("head")[0].appendChild(s);})();`}
    </Script>
  );
}
