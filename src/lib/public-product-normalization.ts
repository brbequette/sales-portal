export function publicStrings(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(item => item.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
  return [];
}

const unique = (values: string[]) => [...new Set(values.map(value => value.trim()).filter(Boolean))];

export function publicUseCases(values: string[]) {
  const text = values.join(' ').toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ['Reinforced concrete', /reinforced|rebar/],
    ['Green concrete', /green concrete|early.entry/],
    ['Asphalt', /asphalt/],
    ['Concrete', /concrete|aggregate|river rock|hard material/],
    ['Masonry, brick & block', /masonry|brick|block|paver/],
    ['Tile & porcelain', /tile|porcelain|ceramic/],
    ['Stone & granite', /stone|granite|marble|quartz/],
    ['Ductile iron', /ductile/],
    ['Metal & steel', /metal|steel|ferrous|iron|demolition/],
    ['Glass', /glass/],
    ['Core drilling', /core bit|core drill|coring/],
    ['Surface preparation', /grind|cup wheel|surface prep|coating remov|polish/],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

export function publicSizes(values: string[]) {
  return unique(values.flatMap(value => {
    const match = value.replace(/[”″]/g, '"').match(/(?:^|\s)(\d{1,2}(?:\.\d+|\s+\d+\/\d+)?)\s*(?:"|IN|INCH|X|$)/i);
    return match ? [`${match[1]}"`] : [];
  })).sort((a, b) => Number.parseFloat(a) - Number.parseFloat(b));
}

export function publicControlledValues(values: string[], kind: 'application' | 'material' | 'equipment') {
  const text = values.join(' ').toLowerCase();
  if (kind === 'application' || kind === 'material') return publicUseCases(values);
  const rules: Array<[string, RegExp]> = [
    ['Walk-behind saw', /walk.?behind|flat saw/], ['High-speed saw', /high.?speed|cut.?off|power cutter/], ['Handheld saw', /handheld|hand saw/], ['Table saw', /table saw/], ['Angle grinder', /angle grinder/], ['Ring saw', /ring saw/], ['Wall saw', /wall saw/], ['Core drill', /core drill/],
  ];
  return rules.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}
