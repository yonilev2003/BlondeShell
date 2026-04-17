const PEAK_HOURS = {
  instagram: ['19:00', '20:00'],
  tiktok: ['11:00', '19:00'],
  twitter: ['09:00', '12:00', '18:00', '21:00'],
  reddit: ['10:00', '14:00'],
  fanvue: ['20:00', '22:00'],
};

export function getPeakHours(platform) {
  return PEAK_HOURS[platform.toLowerCase()] ?? ['12:00', '18:00'];
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
}

function etToUtc(etHour) {
  const [h, m] = etHour.split(':').map(Number);
  const utcH = (h + 4) % 24;
  return `${String(utcH).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function routeContent(contentItem, nsfwTier) {
  const tier = nsfwTier ?? contentItem.tier ?? 'T1';
  const date = contentItem.date ?? todayDateStr();
  const routes = [];

  if (tier === 'T1') {
    const igTimes = getPeakHours('instagram');
    routes.push({
      platform: 'instagram',
      postType: contentItem.mediaType === 'video' ? 'reel' : 'photo',
      scheduledAt: `${date}T${etToUtc(igTimes[0])}:00Z`,
      isPPV: false,
      ppvPrice: null,
    });

    const ttTimes = getPeakHours('tiktok');
    routes.push({
      platform: 'tiktok',
      postType: contentItem.mediaType === 'video' ? 'video' : 'photo',
      scheduledAt: `${date}T${etToUtc(ttTimes[0])}:00Z`,
      isPPV: false,
      ppvPrice: null,
    });

    if (process.env.TWITTER_ACTIVE === 'true') {
      const twTimes = getPeakHours('twitter');
      routes.push({
        platform: 'twitter',
        postType: 'status',
        scheduledAt: `${date}T${etToUtc(twTimes[0])}:00Z`,
        isPPV: false,
        ppvPrice: null,
      });
    }
  } else if (tier === 'T2') {
    const twTimes = getPeakHours('twitter');
    routes.push({
      platform: 'twitter',
      postType: 'status',
      scheduledAt: `${date}T${etToUtc(twTimes[1] ?? twTimes[0])}:00Z`,
      isPPV: false,
      ppvPrice: null,
    });

    const rdTimes = getPeakHours('reddit');
    routes.push({
      platform: 'reddit',
      postType: 'image',
      scheduledAt: `${date}T${etToUtc(rdTimes[0])}:00Z`,
      isPPV: false,
      ppvPrice: null,
    });
  } else if (tier === 'T3') {
    const fvTimes = getPeakHours('fanvue');
    routes.push({
      platform: 'fanvue',
      postType: 'ppv',
      scheduledAt: `${date}T${etToUtc(fvTimes[0])}:00Z`,
      isPPV: true,
      ppvPrice: contentItem.ppvPrice ?? 9.99,
    });

    const teaserTimes = getPeakHours('instagram');
    routes.push({
      platform: 'instagram',
      postType: 'photo',
      scheduledAt: `${date}T${etToUtc(teaserTimes[0])}:00Z`,
      isPPV: false,
      ppvPrice: null,
      isTeaser: true,
    });
  }

  return routes;
}
