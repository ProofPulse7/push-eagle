export const CAMPAIGN_WIZARD_FRESH_PARAM = 'fresh';

export const appendFreshCampaignWizardParam = (href: string) => {
  const [path, query = ''] = href.split('?');
  const params = new URLSearchParams(query);
  params.set(CAMPAIGN_WIZARD_FRESH_PARAM, '1');
  const nextQuery = params.toString();
  return nextQuery ? `${path}?${nextQuery}` : path;
};

export const buildFreshCampaignWizardHref = (href: string) => appendFreshCampaignWizardParam(href);

export const isFreshCampaignWizardIntent = () => {
  if (typeof window === 'undefined') {
    return false;
  }

  return new URLSearchParams(window.location.search).get(CAMPAIGN_WIZARD_FRESH_PARAM) === '1';
};

export const stripFreshCampaignWizardParam = () => {
  if (typeof window === 'undefined') {
    return;
  }

  const url = new URL(window.location.href);
  if (!url.searchParams.has(CAMPAIGN_WIZARD_FRESH_PARAM)) {
    return;
  }

  url.searchParams.delete(CAMPAIGN_WIZARD_FRESH_PARAM);
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
};
